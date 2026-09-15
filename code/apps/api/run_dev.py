"""Development server launcher for the Silo API.

Run this instead of `uvicorn silo_api.main:app --reload`.

Why this file exists
--------------------
Uploaded user projects are extracted into `data/bundles/`, which sits inside
the same tree uvicorn's reloader watches. Every upload therefore looked like
a source change, so uvicorn restarted the API *in the middle of a build* --
killing the background task that was building the container. That is the
"WatchFiles detected changes in 'data\\bundles\\...' Reloading..." spam
followed by builds that never finish.

This launcher watches only the application package.
"""

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "silo_api.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["silo_api"],
        reload_excludes=["data/*", "*.db", "*.sqlite3", "*.log"],
    )
