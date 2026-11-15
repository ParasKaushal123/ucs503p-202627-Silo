"""Run Silo on this computer with one command.

    python scripts/start.py            # everything, using the database in .env
    python scripts/start.py --local    # separate SQLite test database with local accounts
    python scripts/start.py --dev      # hot reload while editing code

It installs missing dependencies, starts the local AI, the API, the live-editing
server and the website, waits until each answers, and prints where to open
Silo. Ctrl+C stops everything. Each part's output goes to .silo_data/logs/.

Needs Python 3.11+, Node.js with pnpm, and uv. Docker Desktop must be running
for uploaded apps to build and run; Silo still opens without it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / ".silo_data"
LOGS = DATA / "logs"
WINDOWS = os.name == "nt"
VENV_PYTHON = ROOT / "apps/api/.venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
NO_WINDOW = subprocess.CREATE_NO_WINDOW if WINDOWS else 0


def say(text: str = "", end: str = "\n") -> None:
    print(text, end=end, flush=True)


def fail(text: str) -> None:
    say(f"\n  x {text}\n")
    raise SystemExit(1)


def dotenv() -> dict[str, str]:
    values = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            match = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
            if match:
                values[match[1]] = match[2].strip("\"'")
    return values


def tool(name: str) -> str | None:
    found = shutil.which(f"{name}.cmd" if WINDOWS else name) or shutil.which(name)
    if not found and name == "semgrep":
        local = Path.home() / ".local/bin" / ("semgrep.exe" if WINDOWS else "semgrep")
        found = str(local) if local.exists() else None
    return found


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket() as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def answers(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return response.status < 500
    except Exception:
        return False


def run(command: list[str], cwd: Path, what: str, env: dict | None = None) -> None:
    say(f"  - {what}...")
    result = subprocess.run(command, cwd=cwd, env=env, creationflags=NO_WINDOW,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        say((result.stdout + result.stderr)[-3000:])
        fail(f"{what} failed (see the output above).")


# ---------------------------------------------------------------- setup


def install_dependencies() -> tuple[str, str]:
    node, pnpm = tool("node"), tool("pnpm")
    if not node or not pnpm:
        fail("Node.js and pnpm are needed: install Node.js, then run `npm install -g pnpm`.")
    if not VENV_PYTHON.exists():
        uv = tool("uv")
        if not uv:
            fail("uv is needed to install the API: https://docs.astral.sh/uv/")
        run([uv, "sync"], ROOT / "apps/api", "Installing the API's Python packages")
    for part in ("web", "collab"):
        if not (ROOT / "apps" / part / "node_modules").exists():
            run([pnpm, "install"], ROOT / "apps" / part, f"Installing the {part} packages")
    return node, pnpm


def database(args, env_file: dict) -> tuple[dict, str]:
    """The database to use; falls back to SQLite when PostgreSQL is not running."""
    url = env_file.get("DATABASE_URL", "postgresql+psycopg://silo:silo@localhost:5432/silo")
    if not args.local and url.startswith("postgresql"):
        parts = urlsplit(url.replace("+psycopg", ""))
        if port_open(parts.port or 5432, parts.hostname or "127.0.0.1"):
            return {}, f"PostgreSQL ({parts.hostname}:{parts.port or 5432})"
        say("  - PostgreSQL is not running, so Silo will use its SQLite test database.")
    secrets_file = DATA / "dev-settings.json"
    if not secrets_file.exists():
        fresh = {"session": secrets.token_urlsafe(48), "service": secrets.token_urlsafe(48)}
        secrets_file.write_text(json.dumps(fresh), encoding="utf-8")
    config = json.loads(secrets_file.read_text(encoding="utf-8"))
    path = (DATA / "silo-local.db").as_posix()
    return ({"DATABASE_URL": f"sqlite:///{path}", "SESSION_SECRET": config["session"],
             "LOCAL_AUTH_ENABLED": "true"}, "SQLite test database (.silo_data/silo-local.db)")


def web_fingerprint(env: dict) -> str:
    web = ROOT / "apps/web"
    digest = hashlib.sha256(env["NEXT_PUBLIC_API_BASE"].encode())
    for folder in ("src", "public"):
        for path in sorted((web / folder).rglob("*")):
            if path.is_file():
                digest.update(str(path.relative_to(web)).encode())
                digest.update(path.read_bytes())
    for name in ("package.json", "next.config.mjs", "tailwind.config.ts", "tsconfig.json"):
        if (web / name).exists():
            digest.update((web / name).read_bytes())
    return digest.hexdigest()


def web_build(pnpm: str, env: dict, dist: str) -> None:
    """Build the website once, and again only when its code or settings change."""
    web = ROOT / "apps/web"
    stamp = web / dist / "silo-build-stamp"
    if stamp.exists() and stamp.read_text() == web_fingerprint(env):
        return
    run([pnpm, "build"], web, "Building the website (the first time takes a minute or two)", env)
    # Taken after the build, which may touch files such as tsconfig.json.
    stamp.write_text(web_fingerprint(env))


def docker_version() -> str | None:
    try:
        out = subprocess.run(["docker", "info", "--format", "{{.ServerVersion}}"],
                             capture_output=True, text=True, timeout=20, creationflags=NO_WINDOW)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout.strip() if out.returncode == 0 and out.stdout.strip() else None


def docker_desktop() -> Path | None:
    for base in (os.environ.get("LOCALAPPDATA", ""), os.environ.get("ProgramFiles", "")):
        for sub in ("Programs/DockerDesktop", "Docker/Docker"):
            exe = Path(base) / sub / "Docker Desktop.exe"
            if base and exe.exists():
                return exe
    return None


def checks(env_file: dict, start_docker: bool) -> dict[str, str]:
    status = {}
    version = docker_version()
    desktop = docker_desktop() if WINDOWS else None
    if not version and desktop and start_docker:
        say("  - Starting Docker Desktop (needed to run uploaded apps)...")
        subprocess.Popen([str(desktop)], creationflags=NO_WINDOW)
        end = time.time() + 120
        while time.time() < end and not version:
            time.sleep(3)
            version = docker_version()
    if version:
        status["Docker"] = f"running (Docker {version})"
    elif shutil.which("docker") or desktop:
        status["Docker"] = "NOT running: start Docker Desktop so uploaded apps can run"
    else:
        status["Docker"] = "not installed: uploaded apps cannot be built or run"
    semgrep = tool("semgrep")
    status["Semgrep"] = ("installed (Security track uses Semgrep + Silo rules)" if semgrep
                         else "not installed: Security track uses Silo's own rules only")
    return status


# ---------------------------------------------------------------- services


class Services:
    def __init__(self) -> None:
        self.children: list[tuple[str, subprocess.Popen]] = []
        LOGS.mkdir(parents=True, exist_ok=True)

    def start(self, name: str, command: list[str], cwd: Path, env: dict) -> None:
        log = open(log_path(name), "w", encoding="utf-8", errors="replace")
        process = subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                                   creationflags=NO_WINDOW)
        self.children.append((name, process))

    def wait(self, name: str, ready, seconds: int) -> bool:
        process = dict(self.children)[name]
        end = time.time() + seconds
        while time.time() < end:
            if process.poll() is not None:
                return False
            if ready():
                return True
            time.sleep(0.5)
        return False

    def stopped(self) -> str | None:
        return next((name for name, p in self.children if p.poll() is not None), None)

    @staticmethod
    def end(process: subprocess.Popen) -> None:
        if process.poll() is None:
            if WINDOWS:  # also ends the processes each part started
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               capture_output=True, creationflags=NO_WINDOW)
            else:
                process.terminate()

    def drop(self, name: str) -> None:
        """Stop one part and stop watching it (Silo carries on without it)."""
        for _, process in [c for c in self.children if c[0] == name]:
            self.end(process)
        self.children = [c for c in self.children if c[0] != name]

    def stop(self) -> None:
        for _, process in reversed(self.children):
            self.end(process)
        for _, process in self.children:
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()


LOG_SUFFIX = ""  # set from the web port, so two copies of Silo keep separate logs


def log_path(name: str) -> Path:
    return LOGS / f"{name}{LOG_SUFFIX}.log"


def tail(name: str, lines: int = 25) -> str:
    path = log_path(name)
    text = path.read_text(encoding="utf-8", errors="replace") if path.exists() else ""
    return "\n".join(text.splitlines()[-lines:])


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Silo on this computer.")
    parser.add_argument("--local", action="store_true", help="separate SQLite test database")
    parser.add_argument("--dev", action="store_true", help="hot reload while editing code")
    parser.add_argument("--no-ai", action="store_true", help="do not start the local AI")
    parser.add_argument("--no-docker", action="store_true", help="do not start Docker Desktop")
    parser.add_argument("--web-port", type=int, default=3000)
    parser.add_argument("--api-port", type=int, default=8000)
    parser.add_argument("--collab-port", type=int, default=1234)
    args = parser.parse_args()
    global LOG_SUFFIX
    LOG_SUFFIX = "" if args.web_port == 3000 else f"-{args.web_port}"
    DATA.mkdir(exist_ok=True)
    say("\n  Silo\n")

    busy = [p for p in (args.web_port, args.api_port, args.collab_port) if port_open(p)]
    if busy:
        fail(f"Port {', '.join(map(str, busy))} is already in use. Is Silo already running? "
             "Stop it, or choose other ports with --web-port/--api-port/--collab-port.")
    env_file = dotenv()
    node, pnpm = install_dependencies()
    db_env, db_label = database(args, env_file)
    secrets_file = DATA / "dev-settings.json"
    service_secret = (env_file.get("COLLAB_SERVICE_SECRET")
                      or (json.loads(secrets_file.read_text())["service"]
                          if secrets_file.exists() else secrets.token_urlsafe(48)))
    dist = ".next-start-local" if db_env else ".next-start"
    env = {
        **os.environ, **db_env,
        "COLLAB_SERVICE_SECRET": service_secret,
        "WEB_ORIGIN": f"http://localhost:{args.web_port}",
        "NEXT_PUBLIC_API_BASE": f"http://localhost:{args.api_port}",
        "SILO_API_URL": f"http://127.0.0.1:{args.api_port}",
        "COLLAB_URL": f"http://127.0.0.1:{args.collab_port}",
        "COLLAB_PUBLIC_URL": f"ws://localhost:{args.collab_port}",
        "COLLAB_PORT": str(args.collab_port), "RUNTIME_PORT": str(args.collab_port),
        "SILO_DIST_DIR": ".next-dev-local" if args.dev and db_env else (
            ".next" if args.dev else dist),
    }
    run([str(VENV_PYTHON), "-m", "alembic", "upgrade", "head"], ROOT / "apps/api",
        "Updating the database", env)
    if not args.dev:
        web_build(pnpm, env, dist)
    status = checks(env_file, start_docker=not args.no_docker)

    services = Services()
    try:
        ai_url = env_file.get("AI_API_URL", "")
        ai_port = urlsplit(ai_url).port if "127.0.0.1" in ai_url or "localhost" in ai_url else None
        start_ai = bool(ai_port) and not args.no_ai and (ROOT / "apps/local-ai/server.mjs").exists()
        if start_ai and port_open(ai_port):
            status["Local AI"] = f"already running on port {ai_port}"
            start_ai = False
        if start_ai:
            services.start("local-ai", [node, "apps/local-ai/server.mjs"], ROOT, env)
        api = [str(VENV_PYTHON), "-m", "uvicorn", "silo_api.main:app", "--host", "127.0.0.1",
               "--port", str(args.api_port)]
        if args.dev:
            api += ["--reload", "--reload-dir", "silo_api"]
        services.start("api", api, ROOT / "apps/api", env)
        services.start("collab", [node, *(["--watch"] if args.dev else []), "server.mjs"],
                       ROOT / "apps/collab", env)
        web = [pnpm, "dev" if args.dev else "start", "--hostname", "0.0.0.0",
               "--port", str(args.web_port)]
        services.start("web", web, ROOT / "apps/web", env)

        say("  - Starting the API, live-editing server and website...")
        for name, ready, seconds in [
            ("api", lambda: answers(f"http://127.0.0.1:{args.api_port}/healthz"), 60),
            ("collab", lambda: port_open(args.collab_port), 30),
            ("web", lambda: answers(f"http://127.0.0.1:{args.web_port}/"), 180),
        ]:
            if not services.wait(name, ready, seconds):
                say(tail(name))
                log = log_path(name).name
                fail(f"The {name} part did not start. Full output: .silo_data/logs/{log}")
        if start_ai:
            say("  - Loading the local AI model...")
            health = f"http://127.0.0.1:{ai_port}/health"
            if services.wait("local-ai", lambda: answers(health), 120):
                line = next((row for row in tail("local-ai", 40).splitlines()
                             if row.startswith("Silo local AI:")), "")
                status["Local AI"] = line.removeprefix("Silo local AI: ") or "running"
            else:
                services.drop("local-ai")
                backup = " Gemini will answer instead." if env_file.get("GEMINI_API_KEY") else ""
                log = log_path("local-ai").name
                status["Local AI"] = f"did not start (see .silo_data/logs/{log}).{backup}"
        elif "Local AI" not in status:
            if args.no_ai and ai_port:
                status["Local AI"] = "not started (--no-ai)"
            else:
                status["Local AI"] = ("Gemini (cloud)" if env_file.get("GEMINI_API_KEY")
                                      else "off: set AI_API_URL or GEMINI_API_KEY in .env")

        sign_in = "local accounts at /auth/local" if db_env else "Google sign-in"
        rows = {
            "Open": f"http://localhost:{args.web_port}",
            "Sign in": f"http://localhost:{args.web_port}/auth/local"
            if db_env else sign_in,
            "Database": db_label,
            "Mode": "development (hot reload)" if args.dev else "production build",
            **status,
            "Logs": ".silo_data/logs/",
        }
        width = max(map(len, rows))
        say("\n  Silo is running\n")
        for key, value in rows.items():
            say(f"    {key.ljust(width)}  {value}")
        say("\n  Press Ctrl+C to stop.\n")
        while True:
            gone = services.stopped()
            if gone:
                say(tail(gone))
                fail(f"The {gone} part stopped. Full output: .silo_data/logs/{log_path(gone).name}")
            time.sleep(1)
    except KeyboardInterrupt:
        say("\n  Stopping Silo...")
    finally:
        services.stop()
        say("  Stopped.\n")


if __name__ == "__main__":
    main()
