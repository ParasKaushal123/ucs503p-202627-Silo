# Silo

**Google Docs for small software.**

Upload a Python app. Silo works out how to run it, containerises it, and gives
you a live URL — no Dockerfile, no deployment config, no DevOps knowledge.

Built for UCS503P (Software Engineering Project), Thapar Institute.

---

## The problem

Generative AI has made writing a small app nearly free. A marketer, analyst or
researcher can prompt their way to a working Flask dashboard in minutes.

*Running* it is still a DevOps job: pick a base image, pin a Python version,
work out the dependencies, find the entry point, expose the right port, notice
that `host="127.0.0.1"` will make the container refuse every connection, wire up
a reverse proxy, add auth.

Silo's bet is that all of that can be **inferred from the source code**, without
asking a language model to guess.

## How it works

Uploading a `.zip` or a single `.py` triggers a deterministic pipeline:

1. **Unwrap** the archive, descending through the wrapper folder that `zip -r`
   creates.
2. **Locate the app root** — in a monorepo, the deployable service may be several
   directories down. Candidate directories are scored on project markers,
   entry-point filenames, depth and naming.
3. **Find the entry point** by ranked search: a `Procfile` directive, then
   standard filenames, then a `__main__` guard, then a framework instance.
4. **Decide how to start it.** This matters more than it sounds. A module that
   does `app = FastAPI()` with no `if __name__ == "__main__"` block exits
   instantly under `python main.py` — the container reports a clean start and
   serves nothing. Such a project is launched with `uvicorn main:app`. Flask
   without a server call gets `gunicorn`; Streamlit gets `streamlit run`.
5. **Resolve dependencies** from `requirements.txt` merged with an AST scan of
   every import, excluding the standard library and modules local to the project
   (so `from app.config import …` never tries to `pip install app`).
6. **Repair local-only bindings** — `host="127.0.0.1"` is rewritten to
   `0.0.0.0` in the build copy, leaving the upload untouched.
7. **Build and run.** If the project ships a `docker-compose.yml`, the whole
   stack is brought up instead of a single container, with host ports remapped
   to ephemeral ones so nothing collides.

A version is only marked **live** once something actually accepts a TCP
connection on the published port. Docker publishes a port the moment a container
starts, whether or not a process is listening behind it, so "the container
started" is not evidence that the app works.

## Architecture

```
Browser ──► Next.js 14 (:3000)
                │  fetch, credentials: include
                ▼
            FastAPI (:8000) ──► PostgreSQL          users · apps · versions · build_logs
                │
                ├─ /auth/*      Google OAuth → signed JWT in an HttpOnly cookie
                ├─ /apps/*      application CRUD
                ├─ /versions/*  upload, status, build logs
                └─ /proxy/{id}  reverse proxy into the running container
                                     │
                                     ▼
                          Docker ── silo-<slug> on an ephemeral host port
```

Builds run in a **detached child process** (`python -m silo_api.build_worker`),
not as a FastAPI background task, so restarting or reloading the API cannot kill
a build halfway through.

## Screens

| Route | Purpose |
|---|---|
| `/` | Landing and Google sign-in |
| `/dashboard` | All your apps, with a live preview of the featured one |
| `/apps/[id]` | One app: live preview, version history, build logs |
| `/apps/[id]/workbench` | Collaborative editing surface — **frontend prototype, mock data** |

## Running it locally

**Prerequisites:** Docker Desktop, Python 3.12+ with [uv](https://docs.astral.sh/uv/),
Node 18+ with pnpm, and a Google OAuth client ID.

```bash
# 1. Configuration
cp .env.example .env                       # fill in your Google credentials
cp apps/web/.env.local.example apps/web/.env.local

# 2. Database
docker compose -f infra/docker-compose.yml up -d

# 3. API
cd apps/api
uv sync
uv run alembic upgrade head
uv run python run_dev.py                   # http://localhost:8000

# 4. Frontend, in a second terminal
cd apps/web
pnpm install
pnpm dev                                   # http://localhost:3000
```

Open http://localhost:3000, sign in with Google, and upload a `.zip` or `.py`.

> Use `run_dev.py` rather than `uvicorn --reload` directly. It scopes the file
> watcher to `silo_api/` only. Uploaded projects are extracted to `.silo_data/`
> outside the watched tree, so an upload is never mistaken for a source change.

## Tests

```bash
cd apps/api
uv run pytest -v
```

39 tests across 7 modules — inference unit tests, route integration tests against
an isolated SQLite database, and an end-to-end pipeline run for each of the five
applications in `evaluation/`. No Docker daemon or network access required.

The suite covers **inference and routing**, not deployment: no image is built and
no container is started, so a passing run does not by itself demonstrate a working
end-to-end deploy.

## Layout

```
apps/api/            FastAPI backend
  silo_api/
    routes/          auth · apps · versions · proxy · health
    services/
      packaging.py   project detection and Dockerfile generation
      builder.py     build strategies, readiness probe, build locks
      compose.py     docker-compose support
    build_worker.py  detached build process entry point
  alembic/           database migrations
  data/              import map and stdlib list for dependency resolution
  tests/             39 tests
apps/web/            Next.js frontend
evaluation/          five applications used by the integration tests
infra/               Postgres compose file
```

## Known limitations

Stated plainly rather than left to be discovered:

- **The Workbench is a prototype.** Its AI proposals, file tree, comments and
  presence indicators are driven by `src/lib/mockData.ts`. No real collaboration
  or code generation happens.
- **Build logs in the App Room are simulated.** The backend records real logs and
  serves them from `GET /versions/{id}/logs`, but the drawer currently renders a
  scripted sequence. Wiring the drawer to that endpoint is outstanding.
- **`services/build_orchestrator.py` and `services/inference/` are superseded**
  by `services/packaging.py` and are no longer called by the running pipeline.
  They are retained because the existing test suite covers them.
- **Apps must be proxy-aware.** Apps are served under `/proxy/<app_id>`, which
  the app itself never sees, so absolute URLs (`/static/style.css`, `href="/about"`)
  will not resolve. Relative URLs and query-string navigation work.
- **Capability analysis and the approval workflow** from the original proposal
  are not implemented.
- **Python only.** Node detection exists but no Node build path.

## Team

Three-person project for UCS503P. See `commit-split/` for the agreed division of
work if that folder is present.
