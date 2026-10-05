"""Docker Compose support.

Plenty of real projects are not one container. sif-sentinel, for example,
needs Postgres, runs Alembic migrations on boot, and bind-mounts a static
frontend directory -- all of which live in its `infra/docker-compose.yml`.
Building only `services/backend/Dockerfile` produces a container that starts,
finds no database, and never serves anything. Docker still publishes the port,
so the proxy gets "connection refused" -> 502, with nothing in the logs.

When a project ships a compose file, the correct thing to do is run it.

Two adjustments are made before bringing the stack up, both written to a
generated copy so the user's own file is never modified:

1. **Host ports are made ephemeral.** Compose files hard-code host ports
   ("5432:5432", "8000:8000"). Silo's own Postgres already occupies 5432, and
   two uploaded apps would collide on 8000. Rewriting each mapping to just the
   container port lets Docker assign a free host port, which Silo then looks up.

2. **container_name is dropped.** A fixed container name collides the moment
   the same project is deployed twice.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

COMPOSE_NAMES = (
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
)

# Service names that usually serve the HTTP interface, best first.
WEB_SERVICE_NAMES = (
    "api",
    "web",
    "app",
    "backend",
    "server",
    "frontend",
    "www",
    "nginx",
    "ui",
)

# Ports that usually mean "this is the web service".
WEB_PORTS = (8000, 80, 3000, 8080, 5000, 8501, 7860, 4000, 5173)

# Services that are definitely not the web interface.
INFRA_IMAGES = (
    "postgres",
    "mysql",
    "mariadb",
    "redis",
    "mongo",
    "rabbitmq",
    "elasticsearch",
    "minio",
    "kafka",
    "zookeeper",
    "memcached",
)

GENERATED_NAME = "docker-compose.silo.yml"


@dataclass
class ComposePlan:
    compose_file: Path  # the generated file we actually run
    original_file: Path
    service: str  # the service serving HTTP
    container_port: int
    notes: list[str] = field(default_factory=list)


def find_compose_file(project_root: Path) -> Path | None:
    """Find a compose file, preferring shallower ones."""
    found: list[Path] = []
    for name in COMPOSE_NAMES:
        for p in project_root.rglob(name):
            rel = p.relative_to(project_root)
            if any(
                part in {"node_modules", ".git", "venv", ".venv", "__pycache__"}
                for part in rel.parts
            ):
                continue
            if len(rel.parts) > 4:
                continue
            # Ignore override files — compose picks them up automatically.
            if "override" in p.name:
                continue
            found.append(p)
    if not found:
        return None
    found.sort(key=lambda p: (len(p.relative_to(project_root).parts), p.name))
    return found[0]


def compose_command() -> list[str] | None:
    """Return the compose CLI invocation, or None if unavailable."""
    if shutil.which("docker"):
        try:
            r = subprocess.run(["docker", "compose", "version"], capture_output=True, timeout=30)
            if r.returncode == 0:
                return ["docker", "compose"]
        except Exception:
            pass
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    return None


def _normalise_ports(ports) -> tuple[list, list[int]]:
    """Strip host bindings so Docker picks a free port. Returns (new, container_ports)."""
    new_ports = []
    container_ports: list[int] = []

    for entry in ports or []:
        if isinstance(entry, dict):
            # long syntax: {target: 8000, published: 8000, host_ip: ..., protocol: ...}
            target = entry.get("target")
            if target is not None:
                container_ports.append(int(target))
                protocol = entry.get("protocol")
                new_ports.append(f"127.0.0.1::{target}" + (f"/{protocol}" if protocol else ""))
            continue

        text = str(entry).strip().strip('"').strip("'")
        # forms: "8000", "8000:8000", "127.0.0.1:8000:8000", "8000:8000/tcp"
        proto = ""
        if "/" in text:
            text, proto = text.split("/", 1)
            proto = "/" + proto
        parts = text.split(":")
        container_port = parts[-1]
        try:
            container_ports.append(int(container_port.split("-")[0]))
        except ValueError:
            # e.g. "${PORT}": keeping it would publish a host port on every interface.
            raise RuntimeError(f"Unsupported port mapping {entry!r}; use a numeric container port")
        new_ports.append(f"127.0.0.1::{container_port}{proto}")

    return new_ports, container_ports


def _pick_web_service(services: dict) -> tuple[str | None, int | None]:
    best = None
    best_score = -999
    best_port = None

    for name, cfg in services.items():
        cfg = cfg or {}
        score = 0
        image = str(cfg.get("image", "")).lower()

        if any(infra in image for infra in INFRA_IMAGES):
            score -= 100
        if any(infra in name.lower() for infra in INFRA_IMAGES):
            score -= 100
        if "worker" in name.lower() or "beat" in name.lower() or "cron" in name.lower():
            score -= 80

        if name.lower() in WEB_SERVICE_NAMES:
            score += 50 - WEB_SERVICE_NAMES.index(name.lower()) * 2

        _, container_ports = _normalise_ports(cfg.get("ports"))
        port = None
        for cp in container_ports:
            if cp in WEB_PORTS:
                port = cp
                score += 40
                break
        if port is None and container_ports:
            port = container_ports[0]
            score += 10

        if cfg.get("build"):
            score += 10

        if port is not None and score > best_score:
            best, best_score, best_port = name, score, port

    return best, best_port


def _inside(base: Path, root: Path, value, what: str) -> None:
    """Refuse a path from the compose file that resolves outside the project.

    Compose resolves relative paths against the compose file's folder (`base`);
    the boundary is the uploaded project (`root`).
    """
    text = str(value)
    if text.startswith("~") or not (base / text).resolve().is_relative_to(root):
        raise RuntimeError(f"{what} points outside the project: {text}")


def _plain(cfg: dict, drivers: tuple) -> bool:
    return not (cfg.get("external") or cfg.get("driver_opts") or cfg.get("driver") not in drivers)


def _check_top_level(data: dict, base: Path, root: Path) -> None:
    """Named volumes, networks, secrets and configs can all reach the host."""
    if data.get("include"):
        raise RuntimeError("Compose 'include' is not supported")
    for name, cfg in (data.get("volumes") or {}).items():
        if not _plain(cfg or {}, (None, "local")):
            raise RuntimeError(f"Volume {name} must be a plain local volume")
    for name, cfg in (data.get("networks") or {}).items():
        if not _plain(cfg or {}, (None, "bridge")):
            raise RuntimeError(f"Network {name} must be a plain bridge network")
    for section in ("secrets", "configs"):
        for name, cfg in (data.get(section) or {}).items():
            cfg = cfg or {}
            if cfg.get("external"):
                raise RuntimeError(f"External {section} are not supported: {name}")
            if cfg.get("file"):
                _inside(base, root, cfg["file"], f"{section[:-1].capitalize()} {name}")


def _check_service_files(name: str, cfg: dict, base: Path, root: Path) -> None:
    """Build contexts, env files and extended files must stay in the project."""
    build = cfg.get("build")
    if isinstance(build, str):
        _inside(base, root, build, f"Service {name} build context")
    elif isinstance(build, dict):
        if build.get("additional_contexts"):
            raise RuntimeError(f"Service {name} uses unsupported additional build contexts")
        context = base / str(build.get("context", "."))
        _inside(base, root, context, f"Service {name} build context")
        if build.get("dockerfile"):
            dockerfile = context / str(build["dockerfile"])
            _inside(base, root, dockerfile, f"Service {name} Dockerfile")
    env_files = cfg.get("env_file") or []
    for entry in [env_files] if isinstance(env_files, (str, dict)) else env_files:
        path = entry.get("path") if isinstance(entry, dict) else entry
        _inside(base, root, path, f"Service {name} env_file")
    extends = cfg.get("extends")
    if isinstance(extends, dict) and extends.get("file"):
        _inside(base, root, extends["file"], f"Service {name} extends")


def prepare(original: Path, project_root: Path | None = None) -> ComposePlan:
    """Read the project's compose file and write a Silo-safe copy beside it.

    Every host path it references must stay inside `project_root` (the uploaded
    project; defaults to the compose file's folder).
    """
    root = (project_root or original.parent).resolve()
    try:
        import yaml
    except ImportError as e:
        raise RuntimeError(
            "PyYAML is required to run docker-compose projects. "
            "Install it in the API environment: pip install pyyaml"
        ) from e

    notes: list[str] = []
    data = yaml.safe_load(original.read_text(encoding="utf-8", errors="ignore")) or {}
    services = data.get("services") or {}
    if not services:
        raise RuntimeError(f"{original.name} declares no services.")

    _check_top_level(data, original.parent.resolve(), root)

    service, container_port = _pick_web_service(services)
    if not service:
        raise RuntimeError(
            f"Could not tell which service in {original.name} serves HTTP. "
            f"None of them publish a port."
        )

    # Rewrite host port bindings and drop fixed container names.
    remapped = []
    for name, cfg in services.items():
        cfg = cfg or {}
        # Uploaded configuration never receives host privileges or external mounts.
        if any(
            cfg.get(key)
            for key in (
                "privileged",
                "devices",
                "cap_add",
                "pid",
                "ipc",
                "uts",
                "userns_mode",
                "cgroup",
                "cgroup_parent",
                "network_mode",
                "volumes_from",
            )
        ):
            raise RuntimeError(f"Service {name} requests unsupported host privileges")
        _check_service_files(name, cfg, original.parent.resolve(), root)
        for mount in cfg.get("volumes") or []:
            source = (
                mount.get("source", "") if isinstance(mount, dict) else str(mount).split(":")[0]
            )
            if source.startswith(("/", "~")) or "\\" in source or ":" in source:
                raise RuntimeError(f"Service {name} uses an unsupported host mount")
            bind = isinstance(mount, dict) and mount.get("type") == "bind"
            if source.startswith(".") or bind:
                resolved = (original.parent / source).resolve()
                if not resolved.is_relative_to(root):
                    raise RuntimeError(f"Service {name} mounts files outside its project")
        cfg["cap_drop"] = ["ALL"]
        cfg["security_opt"] = ["no-new-privileges:true"]
        cfg["mem_limit"] = "512m"
        cfg["pids_limit"] = 128
        if cfg.get("ports"):
            new_ports, _ = _normalise_ports(cfg["ports"])
            if new_ports != cfg["ports"]:
                remapped.append(name)
            cfg["ports"] = new_ports
        cfg.pop("container_name", None)
        services[name] = cfg

    data["services"] = services
    data.pop("version", None)  # obsolete in Compose v2, emits a warning

    generated = original.parent / GENERATED_NAME
    generated.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")

    rel = original.name
    notes.append(f"Found {rel} — running the full stack instead of a single container")
    notes.append(f"Services: {', '.join(services.keys())}")
    notes.append(f"Web service: {service} (container port {container_port})")
    if remapped:
        notes.append(f"Remapped host ports to avoid collisions for: {', '.join(remapped)}")

    return ComposePlan(
        compose_file=generated,
        original_file=original,
        service=service,
        container_port=int(container_port),
        notes=notes,
    )


def project_name(app_slug: str) -> str:
    """Compose project names must be lowercase alphanumeric plus - and _."""
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in app_slug.lower())
    return f"silo-{safe}".strip("-")[:60]


def up(plan: ComposePlan, project: str, log, timeout: int = 900) -> bool:
    """Build and start the stack. Streams output into the build log."""
    cmd = compose_command()
    if cmd is None:
        log("build", "Docker Compose CLI not found. Install Docker Desktop.", "error")
        return False

    full = cmd + [
        "-f",
        str(plan.compose_file),
        "-p",
        project,
        "up",
        "-d",
        "--build",
        "--remove-orphans",
    ]
    log("build", "Running: " + " ".join(full[-8:]))

    try:
        proc = subprocess.run(
            full,
            cwd=str(plan.compose_file.parent),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        log("build", f"Compose build timed out after {timeout}s", "error")
        return False

    for line in (proc.stdout or "").splitlines():
        if line.strip():
            log("build", line.rstrip())
    for line in (proc.stderr or "").splitlines():
        if line.strip():
            # Compose writes ordinary progress to stderr, so only genuine
            # failures are marked as errors.
            level = "error" if proc.returncode != 0 else "info"
            log("build", line.rstrip(), level)

    if proc.returncode != 0:
        log("build", f"docker compose up failed (exit {proc.returncode})", "error")
        return False
    return True


def published_port(project: str, service: str, container_port: int) -> int | None:
    """Ask Docker which host port ended up in front of the web service."""
    cmd = compose_command()
    if cmd is None:
        return None

    # `compose port` is the direct answer when it works.
    try:
        r = subprocess.run(
            cmd + ["-p", project, "port", service, str(container_port)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        out = (r.stdout or "").strip()
        if r.returncode == 0 and ":" in out:
            return int(out.rsplit(":", 1)[1])
    except Exception:
        pass

    # Fall back to inspecting the container directly.
    try:
        import docker

        client = docker.from_env()
        containers = client.containers.list(
            all=True,
            filters={
                "label": [
                    f"com.docker.compose.project={project}",
                    f"com.docker.compose.service={service}",
                ],
            },
        )
        for c in containers:
            c.reload()
            mapping = (c.ports or {}).get(f"{container_port}/tcp")
            if mapping and mapping[0].get("HostPort"):
                return int(mapping[0]["HostPort"])
    except Exception:
        pass
    return None


def service_logs(project: str, service: str, tail: int = 60) -> list[str]:
    cmd = compose_command()
    if cmd is None:
        return []
    try:
        r = subprocess.run(
            cmd + ["-p", project, "logs", "--no-color", f"--tail={tail}", service],
            capture_output=True,
            text=True,
            timeout=60,
        )
        text = (r.stdout or "") + (r.stderr or "")
        return [ln.rstrip() for ln in text.splitlines() if ln.strip()][-tail:]
    except Exception:
        return []


def status(project: str) -> list[dict]:
    cmd = compose_command()
    if cmd is None:
        return []
    try:
        r = subprocess.run(
            cmd + ["-p", project, "ps", "--format", "json"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        out = (r.stdout or "").strip()
        if not out:
            return []
        if out.startswith("["):
            return json.loads(out)
        return [json.loads(line) for line in out.splitlines() if line.strip()]
    except Exception:
        return []


def down(project: str, compose_file: Path | None = None) -> None:
    """Tear the stack down, including its volumes."""
    cmd = compose_command()
    if cmd is None:
        return
    args = cmd[:]
    if compose_file and compose_file.exists():
        args += ["-f", str(compose_file)]
    args += ["-p", project, "down", "--remove-orphans"]
    try:
        subprocess.run(args, capture_output=True, text=True, timeout=180)
    except Exception:
        pass
