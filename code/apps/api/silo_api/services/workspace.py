"""Durable workspace operations; the database is the source of truth."""

import base64
import hashlib
import json
import re
import uuid
from pathlib import Path, PurePosixPath

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models import AuditEvent, Draft, User
from .access import app_access

MAX_FILES = 150
MAX_TEXT = 512_000
MAX_SOURCE = 3_000_000
SENSITIVE = {".env", ".git", "node_modules", ".venv", "__pycache__", ".silo_data"}


def validate_files(files: dict):
    if not isinstance(files, dict) or not files or len(files) > MAX_FILES:
        raise HTTPException(422, f"A workspace needs 1–{MAX_FILES} text files")
    total, seen = 0, set()
    for file_id, entry in files.items():
        if not isinstance(file_id, str) or len(file_id) > 80 or not isinstance(entry, dict):
            raise HTTPException(422, "Invalid file record")
        path, content = entry.get("path"), entry.get("content")
        if not isinstance(path, str) or not isinstance(content, str):
            raise HTTPException(422, "Each file needs a path and text content")
        parts = PurePosixPath(path).parts
        if (
            not path
            or not re.fullmatch(r"[A-Za-z0-9_./@+\-]+", path)
            or len(path) > 240
            or "\\" in path
            or ":" in path
            or path.startswith("/")
            or ".." in parts
            or str(PurePosixPath(path)) != path
            or any(part.lower() in SENSITIVE or part.startswith(".env") for part in parts)
            or path.lower() in seen
        ):
            raise HTTPException(422, f"Unsupported or duplicate path: {path}")
        if "\x00" in content or len(content.encode()) > MAX_TEXT:
            raise HTTPException(422, f"File exceeds text limits: {path}")
        total += len(content.encode())
        seen.add(path.lower())
    if total > MAX_SOURCE:
        raise HTTPException(422, "Workspace exceeds the 3 MB text limit")
    return files


def source_hash(files):
    canonical = {item["path"]: item["content"] for item in files.values()}
    return hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()


def audit(db, app_id, user_id, action, detail=""):
    db.add(AuditEvent(app_id=app_id, actor_id=user_id, action=action, detail=detail))


def get_draft(db: Session, draft_id: str, user_id: str, minimum="viewer"):
    draft = db.get(Draft, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found")
    app, role = app_access(db, draft.app_id, user_id, minimum)
    return draft, app, role


def display_user(db, user_id):
    user = db.get(User, user_id)
    return {"id": user.id, "name": user.name or user.email, "email": user.email}


def import_directory(directory: Path):
    files = {}
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(directory)
        if any(p.lower() in SENSITIVE or p.startswith(".env") for p in rel.parts):
            continue
        if path.stat().st_size > MAX_TEXT:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            continue
        if "\x00" not in content:
            files[str(uuid.uuid4())] = {"path": rel.as_posix(), "content": content}
        if len(files) > MAX_FILES:
            break
    # Remove the conventional single archive wrapper without losing package structure.
    paths = [PurePosixPath(f["path"]).parts for f in files.values()]
    if paths and all(len(p) > 1 and p[0] == paths[0][0] for p in paths):
        for entry in files.values():
            entry["path"] = "/".join(PurePosixPath(entry["path"]).parts[1:])
    return validate_files(files)


def capabilities(files):
    findings = []
    patterns = [
        ("network", r"\b(requests|httpx|urllib|aiohttp|fetch)\b", "Outbound network access"),
        ("process", r"\b(subprocess|os\.system|child_process)\b", "Starts system processes"),
        (
            "filesystem",
            r"\b(open\(|read_text\(|write_text\(|writeFile)",
            "Server filesystem access",
        ),
        (
            "environment",
            r"\b(os\.environ|os\.getenv|process\.env)\b",
            "Reads environment variables",
        ),
        ("database", r"\b(sqlalchemy|psycopg|sqlite3|pymongo|redis)\b", "Connects to a database"),
    ]
    for entry in files.values():
        for category, pattern, label in patterns:
            for line_no, line in enumerate(entry["content"].splitlines(), 1):
                if re.search(pattern, line):
                    findings.append(
                        {
                            "category": category,
                            "label": label,
                            "file": entry["path"],
                            "line": line_no,
                        }
                    )
                    break
    return findings


def render_static(files):
    """Bundle a small vanilla web app into an opaque-origin sandbox document."""
    from posixpath import normpath

    by_path = {f["path"]: f["content"] for f in files.values()}
    html = by_path.get("index.html")
    if html is None:
        return None

    def local_path(path):
        return normpath(path.split("?", 1)[0].lstrip("/"))

    def stylesheet(match):
        path = local_path(match.group(1))
        if path not in by_path:
            return match.group(0)
        text = by_path[path].replace("</style", "<\\/style")
        return f"<style>{text}</style>"

    def script(match):
        path = local_path(match.group(1))
        if path not in by_path:
            return match.group(0)
        text = by_path[path].replace("</script", "<\\/script")
        return f"<script>{text}</script>"

    html = re.sub(
        r'<link\b[^>]*href=["\']([^"\']+)["\'][^>]*>', stylesheet, html, flags=re.IGNORECASE
    )
    html = re.sub(
        r'<script\b[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>',
        script,
        html,
        flags=re.IGNORECASE,
    )
    for path, content in by_path.items():
        if path.endswith(".svg"):
            data = "data:image/svg+xml;base64," + base64.b64encode(content.encode()).decode()
            html = html.replace(f'"{path}"', f'"{data}"').replace(f"'{path}'", f"'{data}'")
    policy = (
        '<meta http-equiv="Content-Security-Policy" content="'
        "default-src 'none'; script-src 'unsafe-inline' blob:; "
        "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; "
        "form-action 'none'; base-uri 'none'\">"
    )
    return html.replace("<head>", "<head>" + policy, 1) if "<head>" in html else policy + html
