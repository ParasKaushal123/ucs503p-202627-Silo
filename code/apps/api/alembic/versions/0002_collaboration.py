"""Persistent collaboration, source checkpoints, reviewable proposals and releases."""

import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def identity():
    return sa.Column("id", sa.String(), primary_key=True)


def reference(name, target, **kwargs):
    return sa.Column(
        name,
        sa.String(),
        sa.ForeignKey(target, ondelete="CASCADE"),
        nullable=False,
        **kwargs,
    )


def created():
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False)


def upgrade():
    op.add_column("users", sa.Column("password_hash", sa.Text(), nullable=True))
    op.create_table(
        "memberships",
        identity(),
        reference("app_id", "apps.id"),
        reference("user_id", "users.id"),
        sa.Column("role", sa.String(), nullable=False),
        sa.UniqueConstraint("app_id", "user_id"),
    )
    op.create_table(
        "invites",
        identity(),
        reference("app_id", "apps.id"),
        sa.Column("token_hash", sa.String(), unique=True, nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Integer(), nullable=False),
    )
    op.create_table(
        "drafts",
        identity(),
        reference("app_id", "apps.id", unique=True),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("files_json", sa.Text(), nullable=False),
        sa.Column("crdt_state", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "checkpoints",
        identity(),
        reference("draft_id", "drafts.id"),
        reference("actor_id", "users.id"),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source_hash", sa.String(), nullable=False),
        sa.Column("files_json", sa.Text(), nullable=False),
        created(),
    )
    op.create_table(
        "discussions",
        identity(),
        reference("draft_id", "drafts.id"),
        reference("actor_id", "users.id"),
        sa.Column("parent_id", sa.String()),
        sa.Column("file_id", sa.String()),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("resolved", sa.Integer(), nullable=False),
        created(),
    )
    op.create_table(
        "proposals",
        identity(),
        reference("draft_id", "drafts.id"),
        reference("actor_id", "users.id"),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("base_hash", sa.String(), nullable=False),
        sa.Column("files_json", sa.Text(), nullable=False),
        sa.Column("error", sa.Text()),
        created(),
    )
    op.create_table(
        "releases",
        identity(),
        reference("app_id", "apps.id"),
        reference("draft_id", "drafts.id"),
        reference("actor_id", "users.id"),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("source_hash", sa.String(), nullable=False),
        sa.Column("files_json", sa.Text(), nullable=False),
        sa.Column("capabilities_json", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        created(),
    )
    op.create_table(
        "audit_events",
        identity(),
        reference("app_id", "apps.id"),
        reference("actor_id", "users.id"),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        created(),
    )
    for table, column in [
        ("memberships", "app_id"),
        ("memberships", "user_id"),
        ("invites", "app_id"),
        ("checkpoints", "draft_id"),
        ("discussions", "draft_id"),
        ("proposals", "draft_id"),
        ("releases", "app_id"),
        ("audit_events", "app_id"),
    ]:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for name in [
        "audit_events",
        "releases",
        "proposals",
        "discussions",
        "checkpoints",
        "drafts",
        "invites",
        "memberships",
    ]:
        op.drop_table(name)
    op.drop_column("users", "password_hash")
