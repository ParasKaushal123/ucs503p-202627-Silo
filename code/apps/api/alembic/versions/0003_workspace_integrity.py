"""Repair original foreign keys and persist operation receipts and preview provenance."""

import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("releases", sa.Column("version_id", sa.String(), nullable=True))
    op.add_column("discussions", sa.Column("anchor_json", sa.Text(), nullable=True))
    op.create_table(
        "operation_receipts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "draft_id", sa.String(), sa.ForeignKey("drafts.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("actor_id", sa.String(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("operation_id", sa.String(), nullable=False),
        sa.Column("payload_hash", sa.String(), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.UniqueConstraint("draft_id", "operation_id"),
    )
    convention = {"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
    for table, column, target in [
        ("versions", "app_id", "apps"),
        ("build_logs", "version_id", "versions"),
    ]:
        inspector = sa.inspect(op.get_bind())
        foreign = next(
            f for f in inspector.get_foreign_keys(table) if f["constrained_columns"] == [column]
        )
        name = foreign["name"] or f"fk_{table}_{column}_{target}"
        if foreign.get("options", {}).get("ondelete") != "CASCADE":
            with op.batch_alter_table(table, naming_convention=convention) as batch:
                batch.drop_constraint(name, type_="foreignkey")
                batch.create_foreign_key(name, target, [column], ["id"], ondelete="CASCADE")
    with op.batch_alter_table("versions") as batch:
        batch.create_unique_constraint("uq_versions_app_number", ["app_id", "version_no"])
    for table, columns in [
        ("apps", ["owner_id", "slug"]),
        ("versions", ["app_id"]),
        ("build_logs", ["version_id"]),
    ]:
        existing = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}
        for column in columns:
            name = f"ix_{table}_{column}"
            if name not in existing:
                op.create_index(name, table, [column], unique=column == "slug")


def downgrade():
    op.drop_table("operation_receipts")
    op.drop_column("discussions", "anchor_json")
    op.drop_column("releases", "version_id")
    with op.batch_alter_table("versions") as batch:
        batch.drop_constraint("uq_versions_app_number", type_="unique")
