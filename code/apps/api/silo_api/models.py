import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_sub: Mapped[str] = mapped_column(String, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )


class App(Base):
    __tablename__ = "apps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )

    versions: Mapped[list["Version"]] = relationship(
        back_populates="app", cascade="all, delete-orphan"
    )


class Version(Base):
    __tablename__ = "versions"
    __table_args__ = (UniqueConstraint("app_id", "version_no", name="uq_versions_app_number"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    bundle_path: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="building")
    container_id: Mapped[str | None] = mapped_column(String, nullable=True)
    internal_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )

    app: Mapped["App"] = relationship(back_populates="versions")
    build_logs: Mapped[list["BuildLog"]] = relationship(
        back_populates="version", cascade="all, delete-orphan"
    )


class BuildLog(Base):
    __tablename__ = "build_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    version_id: Mapped[str] = mapped_column(
        ForeignKey("versions.id", ondelete="CASCADE"), index=True
    )
    phase: Mapped[str] = mapped_column(String)
    level: Mapped[str] = mapped_column(String, default="info")
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, server_default=func.now()
    )

    version: Mapped["Version"] = relationship(back_populates="build_logs")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("app_id", "user_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String, default="viewer")


class Invite(Base):
    __tablename__ = "invites"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    role: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[int] = mapped_column(Integer, default=0)


class Draft(Base):
    __tablename__ = "drafts"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), unique=True)
    generation: Mapped[int] = mapped_column(Integer, default=1)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String, default="Shared draft")
    base_files_json: Mapped[str] = mapped_column(Text, default="{}")
    base_version_no: Mapped[int] = mapped_column(Integer, default=0)
    files_json: Mapped[str] = mapped_column(Text, default="{}")
    crdt_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Checkpoint(Base):
    __tablename__ = "checkpoints"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String)
    source_hash: Mapped[str] = mapped_column(String)
    files_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Discussion(Base):
    __tablename__ = "discussions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    parent_id: Mapped[str | None] = mapped_column(String, nullable=True)
    file_id: Mapped[str | None] = mapped_column(String, nullable=True)
    anchor_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str] = mapped_column(Text)
    resolved: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Proposal(Base):
    __tablename__ = "proposals"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    prompt: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="generating")
    base_hash: Mapped[str] = mapped_column(String)
    base_files_json: Mapped[str] = mapped_column(Text, default="{}")
    files_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Release(Base):
    __tablename__ = "releases"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String)
    version_id: Mapped[str | None] = mapped_column(String, nullable=True)
    version_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_hash: Mapped[str] = mapped_column(String)
    files_json: Mapped[str] = mapped_column(Text)
    capabilities_json: Mapped[str] = mapped_column(Text, default="[]")
    status: Mapped[str] = mapped_column(String, default="preview")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    app_id: Mapped[str] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class OperationReceipt(Base):
    __tablename__ = "operation_receipts"
    __table_args__ = (UniqueConstraint("draft_id", "operation_id"),)
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"))
    operation_id: Mapped[str] = mapped_column(String)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    payload_hash: Mapped[str] = mapped_column(String)
    result_json: Mapped[str] = mapped_column(Text)


class WorkbenchMessage(Base):
    __tablename__ = "workbench_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    attachments_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Attachment(Base):
    __tablename__ = "attachments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    mime: Mapped[str] = mapped_column(String)
    content_base64: Mapped[str] = mapped_column(Text)
