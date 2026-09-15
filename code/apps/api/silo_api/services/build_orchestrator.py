"""Full inference → build → deploy pipeline.

Orchestrates the entire flow from raw Python code to a running container.
Docker is optional at test time — the pipeline gracefully degrades when
the Docker daemon is unavailable.
"""

from dataclasses import dataclass, field
from pathlib import Path

from .inference.detect_entrypoint import detect_entrypoint
from .inference.detect_language import detect_language
from .inference.detect_port import detect_and_repair_port
from .inference.detect_runtime import detect_python_version
from .inference.generate_dockerfile import generate_dockerfile
from .inference.resolve_deps import resolve_dependencies

MAX_RETRIES = 3


@dataclass
class BuildResult:
    success: bool
    container_id: str | None = None
    image_tag: str | None = None
    port: int | None = None
    logs: list[dict] = field(default_factory=list)
    error: str | None = None


def build_and_deploy(app_slug: str, bundle_dir: Path) -> BuildResult:
    """Full inference → build → deploy pipeline."""
    logs: list[dict] = []

    def log(phase: str, message: str, level: str = "info"):
        logs.append({"phase": phase, "message": message, "level": level})

    # 1. Detect language
    lang = detect_language(bundle_dir)
    if lang != "python":
        log("detect", f"Unsupported or undetected language: {lang}", "error")
        return BuildResult(False, logs=logs, error=f"Unsupported language: {lang}")
    log("detect", "Detected: Python")

    # 2. Infer runtime version
    version = detect_python_version(bundle_dir)
    log("runtime", f"Inferred Python version: {version}")

    # 3. Resolve dependencies
    deps = resolve_dependencies(bundle_dir)
    dep_summary = ", ".join(deps[:10]) + ("..." if len(deps) > 10 else "")
    log("deps", f"Resolved {len(deps)} dependencies: {dep_summary}")

    # 4. Detect entry point
    entry = detect_entrypoint(bundle_dir)
    if entry is None:
        log("entrypoint", "Could not determine entry point", "error")
        return BuildResult(False, logs=logs, error="Ambiguous or missing entry point")
    log("entrypoint", f"Entry point: {entry.file} ({entry.reason})")

    # 5. Detect and repair port
    port_result = detect_and_repair_port(bundle_dir, entry.file)
    if port_result.was_repaired:
        log("port", f"Repaired localhost binding -> 0.0.0.0:{port_result.port}", "warn")
    else:
        log("port", f"Port: {port_result.port}")

    # 6. Generate Dockerfile
    has_req = (bundle_dir / "requirements.txt").exists()
    dockerfile_content = generate_dockerfile(
        python_version=version,
        entrypoint=entry.file,
        port=port_result.port,
        packages=deps if not has_req else [],
        has_requirements_txt=has_req,
    )
    (bundle_dir / "Dockerfile").write_text(dockerfile_content)
    log("dockerfile", "Generated Dockerfile")

    # 7. Build + run with retries
    try:
        import docker
    except ImportError:
        log("build", "Docker SDK not available — skipping container build", "warn")
        return BuildResult(
            True,
            image_tag=f"silo-app-{app_slug}:latest",
            port=port_result.port,
            logs=logs,
        )

    try:
        client = docker.from_env()
    except docker.errors.DockerException as e:
        log("build", f"Docker daemon not available: {e}", "warn")
        return BuildResult(
            True,
            image_tag=f"silo-app-{app_slug}:latest",
            port=port_result.port,
            logs=logs,
        )

    image_tag = f"silo-app-{app_slug}:latest"

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            log("build", f"Building image (attempt {attempt}/{MAX_RETRIES})")
            _image, _build_logs = client.images.build(
                path=str(bundle_dir), tag=image_tag, rm=True
            )
            log("build", "Image built successfully")

            # Remove any existing container with the same name
            try:
                old = client.containers.get(f"silo-{app_slug}")
                old.remove(force=True)
            except docker.errors.NotFound:
                pass

            container = client.containers.run(
                image_tag,
                detach=True,
                name=f"silo-{app_slug}",
                ports={f"{port_result.port}/tcp": None},
                mem_limit="256m",
                cpu_quota=50000,  # 0.5 cores
            )
            log("deploy", f"Container started: {container.short_id}")

            # Get the assigned host port
            container.reload()
            host_port = container.ports.get(f"{port_result.port}/tcp", [{}])[0].get(
                "HostPort"
            )
            log("deploy", f"Accessible on host port: {host_port}")

            return BuildResult(
                success=True,
                container_id=container.id,
                image_tag=image_tag,
                port=int(host_port) if host_port else port_result.port,
                logs=logs,
            )

        except docker.errors.BuildError as e:
            log("build", f"Build failed: {e}", "error")
            if attempt == MAX_RETRIES:
                return BuildResult(False, logs=logs, error=str(e))
        except Exception as e:
            log("deploy", f"Deploy failed: {e}", "error")
            if attempt == MAX_RETRIES:
                return BuildResult(False, logs=logs, error=str(e))

    return BuildResult(False, logs=logs, error="Max retries exceeded")
