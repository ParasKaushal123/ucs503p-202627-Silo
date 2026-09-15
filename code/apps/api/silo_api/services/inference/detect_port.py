import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_PORT = 5000


@dataclass
class PortResult:
    port: int
    was_repaired: bool  # True if 127.0.0.1 was rewritten to 0.0.0.0
    bind_line: str  # The original line for logging


# Patterns that capture port numbers from common frameworks
PORT_PATTERNS = [
    r"\.run\([^)]*port\s*=\s*(\d+)",  # app.run(host="...", port=8080)
    r"uvicorn\.run\([^)]*port\s*=\s*(\d+)",  # uvicorn.run(..., port=8000)
    r"\.listen\(\s*(\d+)",  # .listen(3000)
    r"(?:PORT|port)\s*=\s*(\d+)",  # PORT = 8080
    r'os\.environ\.get\(\s*["\']PORT["\']\s*,\s*["\']?(\d+)',  # os.environ.get("PORT", "8000")
]


def detect_and_repair_port(app_dir: Path, entrypoint: str) -> PortResult:
    """Detect the port the app binds to and fix localhost bindings."""
    entry_path = app_dir / entrypoint
    if not entry_path.exists():
        return PortResult(DEFAULT_PORT, False, "")

    source = entry_path.read_text(errors="ignore")
    port = DEFAULT_PORT
    bind_line = ""

    # Find port
    for pattern in PORT_PATTERNS:
        match = re.search(pattern, source)
        if match:
            port = int(match.group(1))
            bind_line = match.group(0)
            break

    # Check and repair localhost binding
    was_repaired = False
    localhost_pattern = r'(host\s*=\s*["\'])(?:127\.0\.0\.1|localhost)(["\'])'
    if re.search(localhost_pattern, source):
        new_source = re.sub(localhost_pattern, r"\g<1>0.0.0.0\g<2>", source)
        if new_source != source:
            entry_path.write_text(new_source)
            was_repaired = True

    return PortResult(port, was_repaired, bind_line)
