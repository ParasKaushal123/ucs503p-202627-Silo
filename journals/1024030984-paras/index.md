# Paras’s Journal

Roll No. 1024030984
Name: Paras Kaushal
Area: Backend + API

+  [W1 : Backend foundation and database](#w1--backend-foundation-and-database)
+  [W2 : Sign-in and app management](#w2--sign-in-and-app-management)
+  [W3 : Uploads, versions and build logs](#w3--uploads-versions-and-build-logs)
+  [W4 : Collaboration data and sharing](#w4--collaboration-data-and-sharing)
+  [W5 : Live editing server](#w5--live-editing-server)
+  [W6 : AI collaborator](#w6--ai-collaborator)
+  [W7 : Local AI, launcher and testing](#w7--local-ai-launcher-and-testing)

---

## W1 : Backend foundation and database

### What I built

+  FastAPI project with `uv` for locked dependencies.
+  `config.py`: all settings read from `.env` into one object.
+  `db.py` and `models.py`: users, apps, versions and build logs
   (SQLAlchemy).
+  Alembic set up, with the first migration.

### Key decision

Keep uploaded files outside the code folder, so the auto-reloader never
restarts the API during a build.

### Outcome

The API starts, connects to PostgreSQL and creates its tables.

---

## W2 : Sign-in and app management

### What I built

+  Google OAuth sign-in, plus optional email and password accounts
   (PBKDF2 hashing).
+  Session as a signed JWT in an HttpOnly cookie.
+  Routes to create, list, rename and delete apps.

### Key decision

One `get_current_user_id` dependency that every protected route uses.

### Outcome

Users sign in and manage their apps through the API.

---

## W3 : Uploads, versions and build logs

### What I built

+  `POST /apps/{id}/versions`: zip upload (8 MB limit) with zip-slip
   protection.
+  Each upload creates a numbered version in its own folder.
+  Builds start in a detached worker process; real logs are stored line
   by line.
+  On start-up, builds interrupted by a reboot are marked failed.

### Key decision

Return immediately after upload and build in the background, so the
page never waits.

### Outcome

Upload, build status and logs work end to end with the build system.

---

## W4 : Collaboration data and sharing

### What I built

+  Tables for drafts, checkpoints, comments, members, invites, releases
   and audit events (migration 0002).
+  Roles owner > editor > commenter > viewer, enforced by one
   `app_access()` function.
+  Invitation links: random, stored as a hash, 2-day expiry, revocable.
+  Checkpoints, restore, comments, preview and publish routes.

### Key decision

Unknown apps return 404 instead of 403, so strangers cannot learn an
app exists.

### Outcome

Everything the Workbench needs is available through the API.

---

## W5 : Live editing server

### What I built

+  Node.js collaboration server with WebSockets and Yjs.
+  15-minute tickets to join a room; viewers and commenters are
   read-only.
+  Every edit saved through the API before it is broadcast and
   confirmed.
+  Access re-checked every 5 seconds, so removed members are cut off.
+  Preview gateway that forwards to running apps after a ticket check.

### Key decision

The database, not the WebSocket server, is the source of truth.

### Outcome

Two people can type on the same line and both changes are kept.

---

## W6 : AI collaborator

### What I built

+  `POST /drafts/{id}/proposals`: sends the request and code (without
   secret files) to Gemini.
+  Replies forced into a JSON patch, shown as a diff.
+  Apply only if the code has not changed since the AI read it.
+  Retries and fallback to lighter Gemini models when busy.
+  "Fix with AI" endpoint for Security Track findings.

### Key decision

The AI only proposes; a person always reviews and applies.

### Outcome

Users ask for changes in plain English and review them before
applying.

---

## W7 : Local AI, launcher and testing

### What I built

+  Local AI server running Gemma 4 E4B on the GPU (model and runtime on
   drive D).
+  Provider chain: local model first, Gemini when it is not running.
+  `scripts/start.py` and `start-silo.bat`: one command installs, starts
   and checks every part.
+  API test suite grown to 117 tests; clean code and README.

### Key decision

Run the AI locally, so no code leaves the machine and no key is needed.

### Outcome

The finished backend is ready for evaluation and starts with a
double-click.
