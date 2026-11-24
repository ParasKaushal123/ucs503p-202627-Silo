"""Complete the original Workbench's draft metadata, conversation and version history."""

import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "drafts", sa.Column("title", sa.String(), nullable=False, server_default="Shared draft")
    )
    op.add_column(
        "drafts", sa.Column("base_files_json", sa.Text(), nullable=False, server_default="{}")
    )
    op.add_column(
        "drafts", sa.Column("base_version_no", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "proposals", sa.Column("base_files_json", sa.Text(), nullable=False, server_default="{}")
    )
    op.add_column("releases", sa.Column("version_no", sa.Integer(), nullable=True))
    op.execute("UPDATE drafts SET base_files_json = files_json")
    op.create_table(
        "workbench_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "draft_id", sa.String(), sa.ForeignKey("drafts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("actor_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachments_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workbench_messages_draft_id", "workbench_messages", ["draft_id"])
    op.create_table(
        "attachments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "draft_id", sa.String(), sa.ForeignKey("drafts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("actor_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("mime", sa.String(), nullable=False),
        sa.Column("content_base64", sa.Text(), nullable=False),
    )
    op.create_index("ix_attachments_draft_id", "attachments", ["draft_id"])


def downgrade():
    op.drop_table("attachments")
    op.drop_table("workbench_messages")
    op.drop_column("releases", "version_no")
    op.drop_column("proposals", "base_files_json")
    for name in ("base_version_no", "base_files_json", "title"):
        op.drop_column("drafts", name)
