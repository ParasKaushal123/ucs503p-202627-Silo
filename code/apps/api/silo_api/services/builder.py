"""The build worker: bundle directory in, running application out.

No FastAPI dependencies on purpose. Imported both by the API process and by
`silo_api.build_worker`, which the API spawns as a detached child process so
that reloading or restarting the API cannot kill a build in flight.

Three deploy strategies, tried in this order:

1. **Compose** -- the project ships a docker-compose file. Run the whole
   stack: database, migrations, workers, volume mounts, environment. This is
   the only strategy that works for projects which need more than one
   container, and most non-trivial projects do.
2. **Own Dockerfile** -- the project ships a Dockerfile but no compose file.
   Build it as-is and trust its CMD.
3. **Generated Dockerfile** -- infer everything (see packaging.py) and write
   a Dockerfile.

Whichever strategy runs, the version is only marked live after something
actually accepts a TCP connection on the published port. Checking that the
container is "running" is not enough: a container whose process crashes or
sits in a retry loop still reports as running, Docker still publishes the
port, and the proxy then returns 502 with nothing explaining why.
"""

from __future__ import annotations

import os
import socket
import sys
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import BuildLog, Version
from . import compose, packaging

# How long to wait for the app to start accepting connections. Migrations,
# seeding and database health checks can legitimately take a while.
READY_TIMEOUT = 180
PROBE_INTERVAL = 2.0


# ---------------------------------------------------------------------------
# Build locks
#
# Builds run in a detached child process, so the database alone cannot tell
# whether a version marked "building" is genuinely in progress or was orphaned
# by a crash. Each build writes a file holding its PID and removes it when
# done; startup recovery checks whether that PID is still alive.
# ---------------------------------------------------------------------------

def locks_dir() -> Path:
    d = Path(settings.bundle_storage_path).resolve().parent / "locks"
    d.mkdir(parents=True, exist_ok=True)
    return d


def lock_path(version_id: str) -> Path:
    return locks_dir() / f"{version_id}.pid"


def pid_is_alive(pid: int) -> bool:
    """Cross-platform 'does this process still exist' check."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return False
            return code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except (OSError, ProcessLookupError):
        return False
    return True


def build_is_running(version_id: str) -> bool:
    path = lock_path(version_id)
    if not path.exists():
        return False
    try:
        return pid_is_alive(int(path.read_text().strip()))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def wait_for_port(port: int, timeout: int = READY_TIMEOUT, host: str = "127.0.0.1") -> bool:
    """Block until something accepts a TCP connection on `port`."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=3):
                return True
        except OSError:
            time.sleep(PROBE_INTERVAL)
    return False


def normalise_line_endings(root: Path, log) -> None:
    """Convert CRLF to LF in shell scripts.

    A project checked out or zipped on Windows carries CRLF line endings. A
    shell script whose shebang ends in \\r fails inside a Linux container with
    a confusing 'no such file or directory' pointing at an interpreter that
    plainly exists. Docker entrypoints are the usual victim.
    """
    fixed = []
    for pattern in ("*.sh", "entrypoint*", "*.bash"):
        for p in root.rglob(pattern):
            if not p.is_file() or p.stat().st_size > 1_000_000:
                continue
            if any(part in packaging.IGNORE_DIRS for part in p.relative_to(root).parts):
                continue
            try:
                raw = p.read_bytes()
            except Exception:
                continue
            if b"\r\n" in raw:
                p.write_bytes(raw.replace(b"\r\n", b"\n"))
                fixed.append(str(p.relative_to(root)).replace("\\", "/"))
    if fixed:
        log("detect", f"Converted Windows line endings to Unix in: {', '.join(fixed[:5])}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_build(version_id: str, app_slug: str, bundle_path: str) -> bool:
    """Plan, build and deploy one version. Returns True on success."""
    db = SessionLocal()
    logs: list[dict] = []
    lock = lock_path(version_id)
    try:
        lock.write_text(str(os.getpid()))
    except Exception:
        pass

    def log(phase: str, message: str, level: str = "info") -> None:
        logs.append({"phase": phase, "message": str(message)[:4000], "level": level})

    try:
        version = db.get(Version, version_id)
        if version is None:
            return False

        bundle_dir = Path(bundle_path)
        project_root = packaging.find_project_root(bundle_dir)
        normalise_line_endings(project_root, log)

        compose_file = compose.find_compose_file(project_root)
        if compose_file is not None:
            return _deploy_compose(db, version, app_slug, project_root,
                                   compose_file, logs, log)
        return _deploy_single(db, version, app_slug, bundle_dir, logs, log)

    except Exception as e:
        log("build", f"Unexpected build error: {e}", "error")
        try:
            v = db.get(Version, version_id)
            if v:
                _finish(db, v, logs, success=False)
        except Exception:
            pass
        return False
    finally:
        db.close()
        lock.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Strategy 1 — docker compose
# ---------------------------------------------------------------------------

def _deploy_compose(db, version, app_slug, project_root, compose_file, logs, log) -> bool:
    rel = compose_file.relative_to(project_root)
    log("detect", f"Compose project detected at {rel}")

    try:
        plan = compose.prepare(compose_file)
    except RuntimeError as e:
        log("detect", str(e), "error")
        _finish(db, version, logs, success=False)
        return False

    for note in plan.notes:
        log("detect", note)

    project = compose.project_name(app_slug)

    # Replace any previous deployment of this app.
    log("deploy", "Stopping any previous deployment")
    compose.down(project, plan.compose_file)

    log("build", "Building and starting the stack (this can take several minutes)")
    if not compose.up(plan, project, log):
        for line in compose.service_logs(project, plan.service):
            log("runtime", line, "error")
        compose.down(project, plan.compose_file)
        _finish(db, version, logs, success=False)
        return False

    host_port = compose.published_port(project, plan.service, plan.container_port)
    if not host_port:
        log("deploy",
            f"The stack started but no host port was published for "
            f"{plan.service}:{plan.container_port}.", "error")
        for line in compose.service_logs(project, plan.service):
            log("runtime", line, "error")
        _finish(db, version, logs, success=False)
        return False

    log("deploy", f"{plan.service} published on host port {host_port} — waiting for it to respond")

    if not wait_for_port(host_port):
        log("deploy",
            f"Nothing accepted a connection on port {host_port} within "
            f"{READY_TIMEOUT}s. The service logs follow.", "error")
        for line in compose.service_logs(project, plan.service):
            log("runtime", line, "error")
        for svc in compose.status(project):
            name = svc.get("Service") or svc.get("Name")
            state = svc.get("State") or svc.get("Status")
            if name:
                log("runtime", f"service {name}: {state}", "error")
        _finish(db, version, logs, success=False)
        return False

    for line in compose.service_logs(project, plan.service, tail=25):
        log("runtime", line)

    log("deploy", f"Live on host port {host_port}")
    _finish(db, version, logs, success=True, container_id=project, port=int(host_port))
    return True


# ---------------------------------------------------------------------------
# Strategies 2 and 3 — single container
# ---------------------------------------------------------------------------

def _deploy_single(db, version, app_slug, bundle_dir, logs, log) -> bool:
    try:
        plan = packaging.make_plan(bundle_dir)
    except ValueError as e:
        log("detect", str(e), "error")
        _finish(db, version, logs, success=False)
        return False

    for note in plan.notes:
        log("detect", note)

    if plan.mode != "dockerfile":
        log("detect", f"Python {plan.python_version} · port {plan.port}")
        if plan.requirements:
            log("deps", f"Installing from {plan.requirements}")
        if plan.packages:
            log("deps", f"Extra packages: {', '.join(plan.packages)}")
        if not plan.requirements and not plan.packages:
            log("deps", "No third-party dependencies detected")

        (plan.app_root / "Dockerfile").write_text(
            packaging.render_dockerfile(plan), encoding="utf-8")
        (plan.app_root / ".dockerignore").write_text(
            packaging.DOCKERIGNORE, encoding="utf-8")
        log("dockerfile", "Generated Dockerfile")
        log("dockerfile", "Start command: " + " ".join(plan.start_command))

    try:
        import docker
        from docker.errors import BuildError, DockerException, NotFound
    except ImportError:
        log("build", "Docker SDK not installed. Run: pip install docker", "error")
        _finish(db, version, logs, success=False)
        return False

    try:
        client = docker.from_env()
        client.ping()
    except DockerException as e:
        log("build", f"Cannot reach Docker. Is Docker Desktop running? {e}", "error")
        _finish(db, version, logs, success=False)
        return False

    image_tag = f"silo-app-{app_slug}:v{version.version_no}"
    container_name = f"silo-{app_slug}"

    log("build", f"Building image from {plan.app_root.name}/ (this can take a few minutes)")
    try:
        _image, build_output = client.images.build(
            path=str(plan.app_root), tag=image_tag, rm=True, forcerm=True, pull=False,
        )
        for chunk in build_output:
            line = (chunk.get("stream") or "").strip()
            if line and not line.startswith("---"):
                log("build", line)
    except BuildError as e:
        log("build", f"Image build failed: {e}", "error")
        for chunk in getattr(e, "build_log", []) or []:
            line = (chunk.get("stream") or chunk.get("error") or "").strip()
            if line:
                log("build", line, "error")
        _finish(db, version, logs, success=False)
        return False
    except Exception as e:
        log("build", f"Image build failed: {e}", "error")
        _finish(db, version, logs, success=False)
        return False

    log("build", "Image built successfully")

    try:
        client.containers.get(container_name).remove(force=True)
        log("deploy", "Removed previous container")
    except NotFound:
        pass
    except Exception as e:
        log("deploy", f"Could not remove old container: {e}", "warning")

    try:
        container = client.containers.run(
            image_tag,
            detach=True,
            name=container_name,
            ports={f"{plan.port}/tcp": None},
            mem_limit="512m",
            nano_cpus=1_000_000_000,
            environment={"PORT": str(plan.port), "PYTHONUNBUFFERED": "1"},
        )
    except Exception as e:
        log("deploy", f"Could not start container: {e}", "error")
        _finish(db, version, logs, success=False)
        return False

    log("deploy", f"Container started: {container.short_id}")

    # Find the assigned host port.
    host_port = None
    for _ in range(10):
        time.sleep(1.0)
        try:
            container.reload()
        except Exception:
            break
        if container.status in {"exited", "dead"}:
            log("deploy", "Container exited immediately. Its output was:", "error")
            for line in _tail(container, 40):
                log("runtime", line, "error")
            _finish(db, version, logs, success=False)
            return False
        mapping = (container.ports or {}).get(f"{plan.port}/tcp")
        if mapping and mapping[0].get("HostPort"):
            host_port = int(mapping[0]["HostPort"])
            break

    if not host_port:
        log("deploy",
            f"Docker published no host port for {plan.port}. The app is "
            f"probably listening on a different port than Silo detected.", "error")
        for line in _tail(container, 25):
            log("runtime", line, "error")
        _finish(db, version, logs, success=False)
        return False

    log("deploy", f"Published on host port {host_port} — waiting for it to respond")

    # The decisive check: does anything actually answer?
    if not wait_for_port(host_port):
        try:
            container.reload()
            state = container.status
        except Exception:
            state = "unknown"
        log("deploy",
            f"Nothing accepted a connection on port {host_port} within "
            f"{READY_TIMEOUT}s (container state: {state}). Its output follows.",
            "error")
        for line in _tail(container, 40):
            log("runtime", line, "error")
        _finish(db, version, logs, success=False)
        return False

    for line in _tail(container, 15):
        log("runtime", line)

    log("deploy", f"Live on host port {host_port}")
    _finish(db, version, logs, success=True,
            container_id=container.id, port=host_port)
    return True


def _tail(container, n: int) -> list[str]:
    try:
        raw = container.logs(tail=n).decode("utf-8", "ignore")
    except Exception:
        return []
    return [line.rstrip() for line in raw.splitlines() if line.strip()][-n:]


# ---------------------------------------------------------------------------

def _finish(
    db: Session,
    version: Version,
    logs: list[dict],
    success: bool,
    container_id: str | None = None,
    port: int | None = None,
) -> None:
    """Persist build logs and set the final version status."""
    for entry in logs:
        db.add(BuildLog(
            version_id=version.id,
            phase=entry["phase"],
            level=entry.get("level", "info"),
            message=entry["message"],
        ))

    if success:
        version.status = "live"
        version.container_id = container_id
        version.internal_port = port
        for other in db.scalars(select(Version).where(
            Version.app_id == version.app_id,
            Version.id != version.id,
            Version.status == "live",
        )):
            other.status = "superseded"
    else:
        version.status = "failed"

    db.commit()
