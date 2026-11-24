# Silo

Silo is a place for a small team to keep, run, edit and check its web apps.
Upload a Python or static app as a `.zip`. Silo builds and runs it in Docker,
lets teammates edit its code together live in the browser, and checks every
version for security risks before anyone trusts it.

UCS503P Software Engineering course project.

## What it does

| Page | What you can do |
|---|---|
| **Dashboard** | See your apps, search them, and upload a new one. |
| **App Room** | Open the running app, browse its version history and build logs, upload a new version, rename it. |
| **Workbench** | Edit the app's code together in real time (like Google Docs for code), with comments, chat, checkpoints, a live preview, and publishing a new version. Invite people as editor, commenter or viewer, and revoke access instantly. |
| **Security track** | A map of every version showing what it can do (a "nutrition label": files, network, system commands, databases…), which risks it adds or fixes compared with the previous version, a risk score, and **Fix with AI** for any finding. |

The AI (Workbench **Ask AI** and **Fix with AI**) never edits code directly.
It proposes a change, Silo shows the diff, and a person applies it.

## Run it

**Windows: double-click `start-silo.bat`.** Or, from this folder:

```
python scripts/start.py --local
```

Then open http://localhost:3000/auth/local and create an account.

`start.py` installs anything missing, starts Docker Desktop if it is closed,
builds the website once, starts every part, waits until each one answers, and
prints a status table. Ctrl+C stops everything. Each part's output is in
`.silo_data/logs/`.

| Command | Use |
|---|---|
| `python scripts/start.py --local` | Separate SQLite test database with local accounts. Best for demos and evaluation. |
| `python scripts/start.py` | The PostgreSQL database and Google sign-in configured in `.env`. Falls back to SQLite if PostgreSQL is not running. |
| `python scripts/start.py --dev` | Hot reload while editing Silo's own code. |
| `--no-ai`, `--no-docker`, `--web-port`, `--api-port`, `--collab-port` | Skip the local AI or Docker, or use other ports. |

**Needs:** Python 3.11+ to run the launcher (the API runs on Python 3.12, which
[uv](https://docs.astral.sh/uv/) installs for it), Node.js 22 with
pnpm, and Docker Desktop (to build and run uploaded apps). Optional:
[Semgrep](https://semgrep.dev) (`uv tool install semgrep`) for a second
security scanner, and the local AI below. Copy `.env.example` to `.env` to
change settings.

## AI on your own computer

Silo runs **Gemma 4 E4B** locally on the GPU through `apps/local-ai`, so the
AI needs no key and no code leaves the machine. The runtime and the 5 GB model
live on drive D (`D:\silo-ai`, `D:\models\silo`), not in the repository. If
`GEMINI_API_KEY` is also set, Gemini is the backup when the local model is not
running. Setup and details are in [apps/local-ai/README.md](apps/local-ai/README.md).

## How it is built

```
 Browser ── HTTP ──────▶ API (FastAPI, Python) ──▶ PostgreSQL or SQLite
    │                     │  ├─ builds and runs uploaded apps in Docker
    │                     │  ├─ Security track: Silo's rules (Python ast) + Semgrep
    │                     │  └─ AI proposals ──▶ local Gemma (apps/local-ai) or Gemini
    └─ WebSocket ───────▶ Collaboration server (Node.js, Yjs)
                            live editing, cursors, app previews
```

| Folder | Part | Technology |
|---|---|---|
| `apps/web` | Website | Next.js 14, React, TypeScript, Tailwind CSS, CodeMirror, React Flow |
| `apps/api` | API | FastAPI, SQLAlchemy, Alembic, httpx, Docker SDK |
| `apps/collab` | Live editing and previews | Node.js, `ws`, Yjs (CRDT) |
| `apps/local-ai` | Local AI server | node-llama-cpp (llama.cpp, Vulkan), Gemma 4 E4B |
| `scripts` | `start.py` launcher, `dev.py` (same with `--dev`) | Python standard library |
| `testing` | Evaluation test cases, test apps, results, report generator | Playwright, Python |
| `testapps` | Sample apps: the security demo and five runtime samples | |
| `docs` | Study guides, UML diagrams, and `archive/` (earlier plans and drafts) | |
| `infra` | `docker-compose.yml` for PostgreSQL | |

### Security track

Every version is read file by file:

- Python is parsed into a syntax tree, so rules see real calls, including calls hidden behind renamed imports, `importlib`, `__import__` or `getattr`.
- JavaScript and HTML are checked with patterns, and every file is searched for secret keys.
- Semgrep 1.183.0 runs alongside when installed.

Each finding has a file, line, CWE number and a fix. Comparing a version with
the one before marks it **Expanding** (gained access or risks) or **Reducing**
(lost them), with a 0–100 risk score.

### Collaboration

Edits are merged with Yjs, so two people typing on the same line both keep
their text. A change is acknowledged only after the API has stored it. Access
is re-checked every 5 seconds, so a removed editor is cut off within seconds,
even with the page open.

## Tests

```
cd apps/api && uv run ruff check silo_api tests && uv run pytest -q        # 117 tests
cd apps/collab && pnpm test                                               # 2 tests
cd apps/web && pnpm exec tsc --noEmit && pnpm lint
cd apps/web && pnpm exec playwright test                                  # 9 browser tests
```

The browser tests need the test copy running on other ports:
`python scripts/start.py --dev --local --no-ai --web-port 3100 --api-port 8100 --collab-port 1334`.

The four evaluation test cases (simultaneous editing, removing an editor,
a risky update and its fix, hidden shell commands) are in `testing/`:

- `testing/Silo_Test_Cases.pdf`: the filled-in course template
- `testing/results/`: each step's result and screenshot, before and after the TC-04 fix
- `apps/web/tests/e2e/evaluation.spec.ts`: the automated test cases
- `testing/SILO_EVALUATION_GUIDE.html`: the plain-language guide

## Limits

- One collaboration server per installation.
- Workspaces of up to 150 text files and 3 MB.
- Static HTML/CSS/JavaScript previews; no frontend bundling.
- The Security track is static analysis: it narrows risk, it does not prove an app safe. Code that only reveals what it calls at run time is marked as possibly running commands.
- The local model has a 16k-token window, so projects over about 24,000 characters go to Gemini.

## Troubleshooting

- **"Port … is already in use":** Silo is already running, or another program has the port. Close it, or pick other ports.
- **Docker Desktop shows "An unexpected error occurred" about `sailor-ingest.sock`:** a stale file from an earlier run. Quit Docker Desktop, rename `%LOCALAPPDATA%\Docker\run` to `run-old`, and start it again.
- **The AI says it could not reach the local model:** start Silo with `scripts/start.py` (which loads it), or check `.silo_data/logs/local-ai.log`.
- **A part did not start:** the launcher prints the last lines of that part's log. The full logs are in `.silo_data/logs/`: `api.log`, `web.log`, `collab.log` and `local-ai.log`. A copy running on another web port adds that port, for example `api-3100.log`.
