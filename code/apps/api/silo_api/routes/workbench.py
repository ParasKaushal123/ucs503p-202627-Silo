"""Workspace, access, checkpoint and release APIs used by the live Workbench."""

import base64
import hashlib
import hmac
import io
import json
import secrets
import tempfile
import time
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    UploadFile,
)
from fastapi.responses import Response
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import (
    App,
    Attachment,
    AuditEvent,
    Checkpoint,
    Discussion,
    Draft,
    Invite,
    Membership,
    OperationReceipt,
    Proposal,
    Release,
    Version,
    WorkbenchMessage,
)
from ..services.access import ROLES, app_access
from ..services.workspace import (
    audit,
    capabilities,
    display_user,
    get_draft,
    import_directory,
    render_static,
    source_hash,
    validate_files,
)
from .apps import get_current_user_id

router = APIRouter(tags=["workbench"])


def draft_out(draft, role):
    files = json.loads(draft.files_json)
    return {
        "id": draft.id,
        "app_id": draft.app_id,
        "role": role,
        "generation": draft.generation,
        "revision": draft.revision,
        "title": draft.title,
        "base_files": json.loads(draft.base_files_json),
        "base_version_no": draft.base_version_no,
        "files": files,
        "source_hash": source_hash(files),
        "updated_at": draft.updated_at.isoformat(),
    }


class Label(BaseModel):
    label: str = Field(default="Checkpoint", min_length=1, max_length=120)
    expected_hash: str | None = None


class RoleInput(BaseModel):
    role: str


@router.post("/apps/{app_id}/draft")
def ensure_draft(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app, role = app_access(db, app_id, user_id)
    draft = db.scalar(select(Draft).where(Draft.app_id == app_id))
    if not draft:
        app_access(db, app_id, user_id, "editor")
        latest = db.scalar(
            select(Version).where(Version.app_id == app_id).order_by(Version.version_no.desc())
        )
        files = {
            str(uuid.uuid4()): {
                "path": "README.md",
                "content": f"# {app.name}\n\nUpload your source files to begin.\n",
            }
        }
        if latest and latest.bundle_path and Path(latest.bundle_path).is_dir():
            files = import_directory(Path(latest.bundle_path))
        draft = Draft(
            app_id=app_id,
            files_json=json.dumps(files),
            base_files_json=json.dumps(files),
            base_version_no=latest.version_no if latest else 0,
        )
        db.add(draft)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            draft = db.scalar(select(Draft).where(Draft.app_id == app_id))
    return draft_out(draft, role)


class DraftTitle(BaseModel):
    title: str = Field(min_length=1, max_length=120)


@router.patch("/drafts/{draft_id}")
def rename_draft(
    draft_id: str, body: DraftTitle, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    draft, _, role = get_draft(db, draft_id, user_id, "editor")
    draft.title = body.title.strip() or "Shared draft"
    db.commit()
    return draft_out(draft, role)


@router.post("/drafts/{draft_id}/import")
async def import_source(
    draft_id: str,
    file: UploadFile = File(...),
    expected_revision: int = Form(...),
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    draft, app, role = get_draft(db, draft_id, user_id, "editor")
    content = await file.read(8_000_001)
    if len(content) > 8_000_000:
        raise HTTPException(413, "Upload exceeds 8 MB")
    with tempfile.TemporaryDirectory(prefix="silo-import-") as directory:
        root = Path(directory)
        if (file.filename or "").lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(content)) as archive:
                    entries = archive.infolist()
                    if len(entries) > 400 or sum(e.file_size for e in entries) > 8_000_000:
                        raise HTTPException(
                            413, "Archive has too many files or exceeds 8 MB expanded"
                        )
                    for entry in entries:
                        target = (root / entry.filename).resolve()
                        if (
                            not target.is_relative_to(root)
                            or (entry.external_attr >> 16) & 0o170000 == 0o120000
                        ):
                            raise HTTPException(422, "Archive contains an unsafe path or symlink")
                    archive.extractall(root)
            except zipfile.BadZipFile:
                raise HTTPException(422, "Invalid ZIP archive")
        else:
            name = Path(file.filename or "app.py").name
            if "/" in name or "\\" in name or not name:
                raise HTTPException(422, "Invalid file name")
            (root / name).write_bytes(content)
        files = import_directory(root)
    db.add(
        Checkpoint(
            draft_id=draft.id,
            actor_id=user_id,
            label="Before source import",
            source_hash=source_hash(json.loads(draft.files_json)),
            files_json=draft.files_json,
        )
    )
    changed = db.execute(
        update(Draft)
        .where(
            Draft.id == draft.id,
            Draft.revision == expected_revision,
        )
        .values(
            files_json=json.dumps(files),
            base_files_json=json.dumps(files),
            crdt_state=None,
            generation=draft.generation + 1,
            revision=draft.revision + 1,
        )
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Draft changed. Refresh before importing.")
    audit(db, app.id, user_id, "source.imported", file.filename or "upload")
    db.commit()
    db.refresh(draft)
    return draft_out(draft, role)


@router.get("/drafts/{draft_id}")
def read_draft(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    draft, _, role = get_draft(db, draft_id, user_id)
    return draft_out(draft, role)


@router.get("/drafts/{draft_id}/export")
def export_draft(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    draft, app, _ = get_draft(db, draft_id, user_id)
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in json.loads(draft.files_json).values():
            archive.writestr(item["path"], item["content"])
    return Response(
        output.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{app.slug}-source.zip"',
        },
    )


@router.post("/apps/{app_id}/fork", status_code=201)
def fork_app(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    from .apps import slugify

    app, _ = app_access(db, app_id, user_id, "editor")
    original = db.scalar(select(Draft).where(Draft.app_id == app_id))
    if not original:
        raise HTTPException(409, "Create a shared draft before forking")
    slug = slugify(app.name + " fork") + "-" + secrets.token_hex(3)
    fork = App(name=app.name + " (fork)", slug=slug, description=app.description, owner_id=user_id)
    db.add(fork)
    db.flush()
    db.add(
        Draft(
            app_id=fork.id,
            files_json=original.files_json,
            base_files_json=original.files_json,
            title=original.title,
        )
    )
    audit(db, fork.id, user_id, "app.forked", app.id)
    db.commit()
    return {"id": fork.id}


def ticket_for(user_id, draft, audience):
    return jwt.encode(
        {
            "sub": user_id,
            "draft": draft.id,
            "generation": draft.generation,
            "aud": audience,
            "exp": int(time.time()) + 900,
        },
        settings.session_secret,
        algorithm="HS256",
    )


@router.post("/drafts/{draft_id}/ticket")
def collab_ticket(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    draft, _, role = get_draft(db, draft_id, user_id)
    return {
        "ticket": ticket_for(user_id, draft, "silo-collab"),
        "url": settings.collab_public_url,
        "role": role,
        "user": display_user(db, user_id),
    }


def service_auth(x_silo_service: str = Header(default="")):
    expected = settings.collab_service_secret
    if not expected or not hmac.compare_digest(x_silo_service, expected):
        raise HTTPException(403, "Invalid service credentials")


def decode_ticket(raw, audience):
    try:
        return jwt.decode(raw, settings.session_secret, algorithms=["HS256"], audience=audience)
    except Exception:
        raise HTTPException(401, "Session expired; reconnect to the workspace")


class InternalAuth(BaseModel):
    ticket: str


@router.post("/internal/collab/load", dependencies=[Depends(service_auth)])
def collab_load(body: InternalAuth, db=Depends(get_db)):
    claims = decode_ticket(body.ticket, "silo-collab")
    draft, _, role = get_draft(db, claims["draft"], claims["sub"])
    if draft.generation != claims["generation"]:
        raise HTTPException(409, "Draft generation changed")
    return {
        **draft_out(draft, role),
        "state": draft.crdt_state,
        "user": display_user(db, claims["sub"]),
    }


@router.post("/internal/collab/check", dependencies=[Depends(service_auth)])
def collab_check(body: InternalAuth, db=Depends(get_db)):
    claims = decode_ticket(body.ticket, "silo-collab")
    draft, _, role = get_draft(db, claims["draft"], claims["sub"])
    if draft.generation != claims["generation"]:
        raise HTTPException(409, "Draft generation changed")
    return {
        "id": draft.id,
        "revision": draft.revision,
        "generation": draft.generation,
        "role": role,
    }


class CommitInput(InternalAuth):
    generation: int
    revision: int
    files: dict
    state: str = Field(max_length=12_000_000)
    action: str = "edit"
    proposal_id: str | None = None
    operation_id: str | None = Field(default=None, max_length=100)
    payload_hash: str | None = Field(default=None, max_length=64)


@router.post("/internal/collab/commit", dependencies=[Depends(service_auth)])
def commit_document(body: CommitInput, db: Session = Depends(get_db)):
    claims = decode_ticket(body.ticket, "silo-collab")
    draft, app, _ = get_draft(
        db, claims["draft"], claims["sub"], "viewer" if body.action == "initialize" else "editor"
    )
    if body.operation_id:
        prior = db.scalar(
            select(OperationReceipt).where(
                OperationReceipt.draft_id == draft.id,
                OperationReceipt.operation_id == body.operation_id,
            )
        )
        if prior:
            if prior.actor_id != claims["sub"] or prior.payload_hash != body.payload_hash:
                raise HTTPException(409, "Operation ID was reused with different contents")
            return {
                **json.loads(prior.result_json),
                "duplicate": True,
                "head_revision": draft.revision,
                "head_hash": source_hash(json.loads(draft.files_json)),
            }
    validate_files(body.files)
    if body.action == "initialize" and (
        draft.crdt_state is not None
        or source_hash(body.files) != source_hash(json.loads(draft.files_json))
    ):
        raise HTTPException(409, "Workspace was already initialized")
    try:
        base64.b64decode(body.state, validate=True)
    except ValueError:
        raise HTTPException(422, "Invalid CRDT state")
    if body.generation != draft.generation or claims["generation"] != draft.generation:
        raise HTTPException(409, "Draft generation changed")
    if body.action == "proposal":
        proposal = db.get(Proposal, body.proposal_id)
        if not proposal or proposal.draft_id != draft.id or proposal.status != "ready":
            raise HTTPException(409, "Proposal is no longer available")
        if source_hash(json.loads(draft.files_json)) != proposal.base_hash:
            raise HTTPException(409, "Proposal is stale. Regenerate against the current draft.")
        if source_hash(body.files) != source_hash(json.loads(proposal.files_json)):
            raise HTTPException(422, "Proposal output does not match the reviewed files")
        proposal.status = "applied"
        db.add(
            Checkpoint(
                draft_id=draft.id,
                actor_id=claims["sub"],
                label="Before AI change",
                source_hash=proposal.base_hash,
                files_json=draft.files_json,
            )
        )
    if body.action != "initialize":
        audit(db, app.id, claims["sub"], "draft." + body.action)
    member_roles = ["editor"] if body.action != "initialize" else ["viewer", "commenter", "editor"]
    allowed_apps = select(App.id).where(
        App.id == app.id,
        or_(
            App.owner_id == claims["sub"],
            App.id.in_(
                select(Membership.app_id).where(
                    Membership.user_id == claims["sub"],
                    Membership.role.in_(member_roles),
                )
            ),
        ),
    )
    result = db.execute(
        update(Draft)
        .where(
            Draft.id == draft.id,
            Draft.revision == body.revision,
            Draft.generation == body.generation,
            Draft.app_id.in_(allowed_apps),
        )
        .values(
            files_json=json.dumps(body.files),
            crdt_state=body.state,
            revision=body.revision + 1,
            updated_at=datetime.now(timezone.utc),
        )
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Draft changed; reconnect before editing")
    result_data = {"revision": body.revision + 1, "source_hash": source_hash(body.files)}
    if body.operation_id:
        db.add(
            OperationReceipt(
                draft_id=draft.id,
                actor_id=claims["sub"],
                operation_id=body.operation_id,
                payload_hash=body.payload_hash or "",
                result_json=json.dumps(result_data),
            )
        )
    db.commit()
    return result_data


@router.get("/apps/{app_id}/members")
def members(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app, _ = app_access(db, app_id, user_id)
    result = [{**display_user(db, app.owner_id), "role": "owner"}]
    for grant in db.scalars(select(Membership).where(Membership.app_id == app_id)):
        result.append({**display_user(db, grant.user_id), "role": grant.role})
    return result


@router.patch("/apps/{app_id}/members/{member_id}")
def change_member(
    app_id: str,
    member_id: str,
    body: RoleInput,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    app, _ = app_access(db, app_id, user_id, "owner")
    if member_id == app.owner_id or body.role not in {"viewer", "commenter", "editor"}:
        raise HTTPException(422, "Choose viewer, commenter or editor for a collaborator")
    grant = db.scalar(
        select(Membership).where(Membership.app_id == app_id, Membership.user_id == member_id)
    )
    if not grant:
        raise HTTPException(404, "Member not found")
    grant.role = body.role
    audit(db, app_id, user_id, "access.changed", member_id + ":" + body.role)
    db.commit()
    return {"ok": True}


@router.delete("/apps/{app_id}/members/{member_id}", status_code=204)
def revoke_member(
    app_id: str, member_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    app_access(db, app_id, user_id, "owner")
    grant = db.scalar(
        select(Membership).where(Membership.app_id == app_id, Membership.user_id == member_id)
    )
    if not grant:
        raise HTTPException(404, "Collaborator not found")
    db.delete(grant)
    audit(db, app_id, user_id, "access.revoked", member_id)
    db.commit()


@router.post("/apps/{app_id}/invites")
def create_invite(
    app_id: str, body: RoleInput, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    app_access(db, app_id, user_id, "owner")
    if body.role not in {"viewer", "commenter", "editor"}:
        raise HTTPException(422, "Invalid invitation role")
    token = secrets.token_urlsafe(32)
    db.add(
        Invite(
            app_id=app_id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            role=body.role,
            expires_at=datetime.now(timezone.utc) + timedelta(days=2),
        )
    )
    audit(db, app_id, user_id, "invite.created", body.role)
    db.commit()
    return {"url": f"{settings.web_origin}/join/{token}", "role": body.role}


@router.get("/apps/{app_id}/invites")
def list_invites(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app_access(db, app_id, user_id, "owner")
    return [
        {
            "id": i.id,
            "role": i.role,
            "expires_at": i.expires_at.isoformat(),
            "revoked": bool(i.revoked),
        }
        for i in db.scalars(select(Invite).where(Invite.app_id == app_id))
    ]


@router.delete("/apps/{app_id}/invites", status_code=204)
def revoke_invites(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app_access(db, app_id, user_id, "owner")
    for invite in db.scalars(select(Invite).where(Invite.app_id == app_id)):
        invite.revoked = 1
    audit(db, app_id, user_id, "invites.revoked")
    db.commit()


@router.post("/invites/{token}/accept")
def accept_invite(token: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    invite = db.scalar(
        select(Invite).where(Invite.token_hash == hashlib.sha256(token.encode()).hexdigest())
    )
    if not invite or invite.revoked:
        raise HTTPException(404, "Invitation not found")
    if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(410, "Invitation expired")
    app = db.get(App, invite.app_id)
    grant = db.scalar(
        select(Membership).where(Membership.app_id == app.id, Membership.user_id == user_id)
    )
    if app.owner_id != user_id and not grant:
        db.add(Membership(app_id=app.id, user_id=user_id, role=invite.role))
        audit(db, app.id, user_id, "invite.accepted", invite.role)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    return {"app_id": app.id}


@router.get("/drafts/{draft_id}/checkpoints")
def checkpoints(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    get_draft(db, draft_id, user_id)
    return [
        {
            "id": c.id,
            "label": c.label,
            "source_hash": c.source_hash,
            "created_at": c.created_at.isoformat(),
            "actor": display_user(db, c.actor_id),
        }
        for c in db.scalars(
            select(Checkpoint)
            .where(Checkpoint.draft_id == draft_id)
            .order_by(Checkpoint.created_at.desc())
        )
    ]


@router.post("/drafts/{draft_id}/checkpoints")
def checkpoint(
    draft_id: str, body: Label, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    draft, app, _ = get_draft(db, draft_id, user_id, "editor")
    digest = source_hash(json.loads(draft.files_json))
    if body.expected_hash and body.expected_hash != digest:
        raise HTTPException(409, "Draft changed before checkpoint")
    c = Checkpoint(
        draft_id=draft.id,
        actor_id=user_id,
        label=body.label,
        source_hash=digest,
        files_json=draft.files_json,
    )
    db.add(c)
    audit(db, app.id, user_id, "checkpoint.created", body.label)
    db.commit()
    return {"id": c.id, "source_hash": digest}


class RestoreInput(BaseModel):
    checkpoint_id: str
    expected_revision: int


@router.post("/drafts/{draft_id}/restore")
def restore(
    draft_id: str, body: RestoreInput, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    draft, app, _ = get_draft(db, draft_id, user_id, "editor")
    c = db.get(Checkpoint, body.checkpoint_id)
    if not c or c.draft_id != draft.id:
        raise HTTPException(404, "Checkpoint not found")
    db.add(
        Checkpoint(
            draft_id=draft.id,
            actor_id=user_id,
            label="Before restore",
            source_hash=source_hash(json.loads(draft.files_json)),
            files_json=draft.files_json,
        )
    )
    changed = db.execute(
        update(Draft)
        .where(
            Draft.id == draft.id,
            Draft.revision == body.expected_revision,
        )
        .values(
            files_json=c.files_json,
            crdt_state=None,
            generation=draft.generation + 1,
            revision=draft.revision + 1,
        )
    )
    if changed.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Draft changed. Refresh before restoring.")
    audit(db, app.id, user_id, "checkpoint.restored", c.id)
    db.commit()
    return {"ok": True}


class CommentInput(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    file_id: str | None = None
    parent_id: str | None = None
    anchor: dict | None = None


@router.get("/drafts/{draft_id}/comments")
def comments(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    get_draft(db, draft_id, user_id)
    return [
        {
            "id": c.id,
            "body": c.body,
            "file_id": c.file_id,
            "anchor": json.loads(c.anchor_json) if c.anchor_json else None,
            "parent_id": c.parent_id,
            "resolved": bool(c.resolved),
            "created_at": c.created_at.isoformat(),
            "actor": display_user(db, c.actor_id),
        }
        for c in db.scalars(
            select(Discussion)
            .where(Discussion.draft_id == draft_id)
            .order_by(Discussion.created_at)
        )
    ]


@router.post("/drafts/{draft_id}/comments", status_code=201)
def add_comment(
    draft_id: str, body: CommentInput, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    draft, app, _ = get_draft(db, draft_id, user_id, "commenter")
    if body.file_id and body.file_id not in json.loads(draft.files_json):
        raise HTTPException(404, "File not found")
    if body.parent_id:
        parent = db.get(Discussion, body.parent_id)
        if not parent or parent.draft_id != draft.id:
            raise HTTPException(404, "Thread not found")
    if body.anchor and len(json.dumps(body.anchor)) > 8000:
        raise HTTPException(422, "Comment anchor is too large")
    fields = body.model_dump(exclude={"anchor"})
    comment = Discussion(
        draft_id=draft.id,
        actor_id=user_id,
        **fields,
        anchor_json=json.dumps(body.anchor) if body.anchor else None,
    )
    db.add(comment)
    audit(db, app.id, user_id, "comment.created")
    db.commit()
    return {"id": comment.id}


@router.post("/comments/{comment_id}/resolve")
def resolve_comment(comment_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    comment = db.get(Discussion, comment_id)
    if not comment:
        raise HTTPException(404, "Comment not found")
    _, _, role = get_draft(db, comment.draft_id, user_id, "commenter")
    if comment.actor_id != user_id and ROLES[role] < ROLES["editor"]:
        raise HTTPException(403, "Only the author or an editor can resolve this thread")
    comment.resolved = int(not comment.resolved)
    db.commit()
    return {"resolved": bool(comment.resolved)}


def release_out(release):
    return {
        "id": release.id,
        "label": release.label,
        "source_hash": release.source_hash,
        "status": release.status,
        "version_id": release.version_id,
        "version_no": release.version_no,
        "created_at": release.created_at.isoformat(),
        "capabilities": json.loads(release.capabilities_json),
        "kind": "static"
        if any(f["path"] == "index.html" for f in json.loads(release.files_json).values())
        else "python",
    }


@router.get("/apps/{app_id}/releases")
def list_releases(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app_access(db, app_id, user_id)
    return [
        release_out(r)
        for r in db.scalars(
            select(Release).where(Release.app_id == app_id).order_by(Release.created_at.desc())
        )
    ]


@router.post("/drafts/{draft_id}/releases", status_code=201)
def create_release(
    draft_id: str, body: Label, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    draft, app, _ = get_draft(db, draft_id, user_id, "editor")
    files = json.loads(draft.files_json)
    digest = source_hash(files)
    if body.expected_hash and body.expected_hash != digest:
        raise HTTPException(409, "Draft changed; wait for Saved before previewing")
    db.scalar(select(App).where(App.id == app.id).with_for_update())
    latest_no = db.scalar(select(func.max(Version.version_no)).where(Version.app_id == app.id)) or 0
    number = latest_no + 1
    source_dir = (
        Path(settings.bundle_storage_path).resolve().parent / "releases" / str(uuid.uuid4())
    )
    for file in files.values():
        path = source_dir / file["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(file["content"], encoding="utf-8")
    version = Version(app_id=app.id, version_no=number, bundle_path=str(source_dir), status="ready")
    db.add(version)
    db.flush()
    release = Release(
        app_id=app.id,
        draft_id=draft.id,
        actor_id=user_id,
        label=body.label,
        source_hash=digest,
        files_json=draft.files_json,
        version_id=version.id,
        version_no=number,
        capabilities_json=json.dumps(capabilities(files)),
    )
    db.add(release)
    audit(db, app.id, user_id, "release.created", body.label)
    db.commit()
    return release_out(release)


@router.post("/releases/{release_id}/build")
def build_python(
    release_id: str,
    background_tasks: BackgroundTasks,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    from .versions import _launch_build

    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(404, "Release not found")
    app, _ = app_access(db, release.app_id, user_id, "editor")
    if release.version_id:
        version = db.get(Version, release.version_id)
        if version and version.status in {"building", "live"}:
            return {"version_id": version.id}
    files = validate_files(json.loads(release.files_json))
    number = (
        db.scalar(select(func.max(Version.version_no)).where(Version.app_id == app.id)) or 0
    ) + 1
    workspace = Path(settings.bundle_storage_path).resolve().parent / "builds" / release.id
    workspace.mkdir(parents=True, exist_ok=True)
    for file in files.values():
        target = workspace / file["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(file["content"], encoding="utf-8")
    # Always construct from the immutable release, never the editable draft directory.
    version = db.get(Version, release.version_id) if release.version_id else None
    if version is None:
        version = Version(
            app_id=app.id, version_no=number, bundle_path=str(workspace), status="building"
        )
        db.add(version)
        db.flush()
    else:
        version.bundle_path = str(workspace)
        version.status = "building"
    release.version_id = version.id
    audit(db, app.id, user_id, "build.started", release.id)
    db.commit()
    _launch_build(version.id, f"{app.slug}-{release.id[:8]}", str(workspace), background_tasks)
    return {"version_id": version.id}


class PublishInput(BaseModel):
    expected_approved_version_id: str | None = None


@router.post("/releases/{release_id}/publish")
def publish(
    release_id: str,
    body: PublishInput = PublishInput(),
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(404, "Release not found")
    # Editors may publish; the expected-version check below stops two people
    # publishing over each other without seeing the other's release.
    app, _ = app_access(db, release.app_id, user_id, "editor")
    if app.approved_version_id == release.id:
        return release_out(release)
    swapped = db.execute(
        update(App)
        .where(
            App.id == app.id,
            App.approved_version_id == body.expected_approved_version_id,
        )
        .values(approved_version_id=release.id)
    )
    if swapped.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Published version changed. Reload before publishing.")
    files = json.loads(release.files_json)
    if not any(f["path"] == "index.html" for f in files.values()):
        version = db.get(Version, release.version_id) if release.version_id else None
        if not version or version.status != "live":
            raise HTTPException(409, "Build a healthy Python preview before publishing")
    for previous in db.scalars(
        select(Release).where(Release.app_id == app.id, Release.status == "published")
    ):
        previous.status = "superseded"
    release.status = "published"
    if release.version_id:
        db.get(Version, release.version_id).status = "live"
    app.approved_version_id = release.id
    draft = db.get(Draft, release.draft_id)
    draft.base_files_json = release.files_json
    draft.base_version_no = release.version_no or 0
    audit(db, app.id, user_id, "release.published", release.id)
    db.commit()
    return release_out(release)


@router.post("/releases/{release_id}/ticket")
def runtime_ticket(release_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    release = db.get(Release, release_id)
    if not release:
        raise HTTPException(404, "Release not found")
    draft, _, _ = get_draft(db, release.draft_id, user_id)
    token = jwt.encode(
        {
            "sub": user_id,
            "release": release.id,
            "aud": "silo-runtime",
            "exp": int(time.time()) + 900,
        },
        settings.session_secret,
        algorithm="HS256",
    )
    return {
        "url": f"http://preview-{release.id}.localhost:{settings.runtime_port}/?ticket={token}",
        "html": render_static(json.loads(release.files_json)),
        "source_hash": release.source_hash,
        "generation": draft.generation,
    }


@router.get("/apps/{app_id}/live")
def live_app(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app, _ = app_access(db, app_id, user_id)
    release = db.get(Release, app.approved_version_id) if app.approved_version_id else None
    if not release:
        return {**app_preview(app_id, None, user_id, db), "name": app.name, "label": "Live version"}
    return {
        **runtime_ticket(release.id, user_id, db),
        "name": app.name,
        "label": release.label,
        "id": release.id,
    }


@router.get("/apps/{app_id}/preview")
def app_preview(
    app_id: str,
    version_id: str | None = None,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    app, _ = app_access(db, app_id, user_id)
    if version_id:
        version = db.get(Version, version_id)
        if not version or version.app_id != app.id:
            raise HTTPException(404, "Version not found")
        release = db.scalar(select(Release).where(Release.version_id == version.id))
        if release:
            return {**runtime_ticket(release.id, user_id, db), "version_id": version.id}
    else:
        release = db.get(Release, app.approved_version_id) if app.approved_version_id else None
        if release:
            return {**runtime_ticket(release.id, user_id, db), "version_id": release.version_id}
        version = db.scalar(
            select(Version)
            .where(Version.app_id == app.id, Version.status == "live")
            .order_by(Version.version_no.desc())
        )
    if not version or version.status != "live" or not version.internal_port:
        raise HTTPException(409, "No running preview for this version yet")
    token = jwt.encode(
        {
            "sub": user_id,
            "version": version.id,
            "aud": "silo-runtime",
            "exp": int(time.time()) + 900,
        },
        settings.session_secret,
        algorithm="HS256",
    )
    return {
        "url": f"http://preview-{version.id}.localhost:{settings.runtime_port}/?ticket={token}",
        "html": None,
        "version_id": version.id,
        "source_hash": None,
    }


@router.post("/internal/runtime/load", dependencies=[Depends(service_auth)])
def runtime_load(body: InternalAuth, db=Depends(get_db)):
    claims = decode_ticket(body.ticket, "silo-runtime")
    if claims.get("version"):
        version = db.get(Version, claims["version"])
        if not version:
            raise HTTPException(404, "Version not found")
        app_access(db, version.app_id, claims["sub"])
        if version.status != "live" or not version.internal_port:
            raise HTTPException(409, "This version is not running")
        return {
            "id": version.id,
            "files": {},
            "status": "live",
            "upstream_port": version.internal_port,
        }
    release = db.get(Release, claims["release"])
    if not release:
        raise HTTPException(404, "Release not found")
    app_access(db, release.app_id, claims["sub"])
    version = db.get(Version, release.version_id) if release.version_id else None
    return {
        "id": release.id,
        "files": json.loads(release.files_json),
        "status": release.status,
        "upstream_port": version.internal_port if version and version.status == "live" else None,
    }


class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    attachments: list[str] = Field(default_factory=list, max_length=8)


@router.get("/drafts/{draft_id}/messages")
def list_messages(draft_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    get_draft(db, draft_id, user_id)
    return [
        {
            "id": m.id,
            "body": m.body,
            "actor": display_user(db, m.actor_id),
            "created_at": m.created_at.isoformat(),
            "attachments": json.loads(m.attachments_json),
        }
        for m in db.scalars(
            select(WorkbenchMessage)
            .where(WorkbenchMessage.draft_id == draft_id)
            .order_by(WorkbenchMessage.created_at)
            .limit(300)
        )
    ]


@router.post("/drafts/{draft_id}/messages", status_code=201)
def add_message(
    draft_id: str, body: MessageInput, user_id=Depends(get_current_user_id), db=Depends(get_db)
):
    get_draft(db, draft_id, user_id, "commenter")
    attachments = []
    for attachment_id in body.attachments:
        attachment = db.get(Attachment, attachment_id)
        if not attachment or attachment.draft_id != draft_id:
            raise HTTPException(404, "Attachment not found")
        attachments.append({"id": attachment.id, "name": attachment.name})
    message = WorkbenchMessage(
        draft_id=draft_id,
        actor_id=user_id,
        body=body.body,
        attachments_json=json.dumps(attachments),
    )
    db.add(message)
    db.commit()
    return {"id": message.id}


@router.post("/drafts/{draft_id}/attachments", status_code=201)
async def attach_file(
    draft_id: str,
    file: UploadFile = File(...),
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    get_draft(db, draft_id, user_id, "commenter")
    content = await file.read(1_000_001)
    if len(content) > 1_000_000:
        raise HTTPException(413, "Attachments are limited to 1 MB")
    name = Path(file.filename or "attachment.txt").name
    if any(s in name.lower() for s in (".env", "credential", "secret", ".pem")):
        raise HTTPException(422, "Protected files cannot be attached")
    mime = file.content_type or "application/octet-stream"
    if mime not in {"image/png", "image/jpeg", "image/webp"}:
        try:
            content.decode("utf-8")
        except UnicodeError:
            raise HTTPException(422, "Attach an image or a UTF-8 text file")
        mime = "text/plain"
    attachment = Attachment(
        draft_id=draft_id,
        actor_id=user_id,
        name=name,
        mime=mime,
        content_base64=base64.b64encode(content).decode(),
    )
    db.add(attachment)
    db.commit()
    return {"id": attachment.id, "name": attachment.name, "mime": attachment.mime}


@router.get("/attachments/{attachment_id}")
def read_attachment(attachment_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    attachment = db.get(Attachment, attachment_id)
    if not attachment:
        raise HTTPException(404, "Attachment not found")
    get_draft(db, attachment.draft_id, user_id)
    return Response(
        base64.b64decode(attachment.content_base64),
        media_type=attachment.mime,
        headers={"Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/apps/{app_id}/activity")
def activity(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app_access(db, app_id, user_id)
    return [
        {
            "id": e.id,
            "action": e.action,
            "detail": e.detail,
            "created_at": e.created_at.isoformat(),
            "actor": display_user(db, e.actor_id),
        }
        for e in db.scalars(
            select(AuditEvent)
            .where(AuditEvent.app_id == app_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(60)
        )
    ]
