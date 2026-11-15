"""Run Silo for development (hot reload). Same as `python scripts/start.py --dev`.

Kept so older commands and guides keep working, for example:

    python scripts/dev.py --local --web-port 3100 --api-port 8100 --collab-port 1334
"""

import runpy
import sys
from pathlib import Path

if __name__ == "__main__":
    if "--dev" not in sys.argv:
        sys.argv.insert(1, "--dev")
    runpy.run_path(str(Path(__file__).with_name("start.py")), run_name="__main__")
