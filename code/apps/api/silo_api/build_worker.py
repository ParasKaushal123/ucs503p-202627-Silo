"""Entry point for a detached build process.

Spawned by routes/versions.py as:

    python -m silo_api.build_worker <version_id> <app_slug> <bundle_path>

Running the build here rather than in a FastAPI background task means the
API server can reload or restart without killing an in-flight build.
"""

import sys

from .services.builder import run_build


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: python -m silo_api.build_worker <version_id> <app_slug> <bundle_path>",
              file=sys.stderr)
        return 2

    version_id, app_slug, bundle_path = sys.argv[1:4]
    ok = run_build(version_id, app_slug, bundle_path)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
