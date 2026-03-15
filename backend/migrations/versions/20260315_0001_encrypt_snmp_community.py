"""Rename devices.snmp_community → snmp_community_enc (encrypt at rest)

Revision ID: 20260315_0001
Revises: 20260314_0001
Create Date: 2026-03-15
"""
from alembic import op

revision = "20260315_0001"
down_revision = "20260314_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "devices",
        "snmp_community",
        new_column_name="snmp_community_enc",
    )


def downgrade() -> None:
    op.alter_column(
        "devices",
        "snmp_community_enc",
        new_column_name="snmp_community",
    )
