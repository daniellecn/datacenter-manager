"""Add device_types table and seed built-in types

Revision ID: add_device_types
Revises: add_corridors
Create Date: 2026-03-13 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "add_device_types"
down_revision: Union[str, None] = "add_corridors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_BUILTIN_TYPES = [
    # (name, label, color, icon_key, sort_order)
    ("server",        "Server",        "#2563eb", "server",        1),
    ("switch",        "Switch",        "#16a34a", "switch",        2),
    ("router",        "Router",        "#9333ea", "router",        3),
    ("firewall",      "Firewall",      "#dc2626", "firewall",      4),
    ("storage",       "Storage",       "#ea580c", "storage",       5),
    ("pdu",           "PDU",           "#ca8a04", "pdu",           6),
    ("patch_panel",   "Patch Panel",   "#64748b", "patch_panel",   7),
    ("kvm",           "KVM",           "#6b7280", "generic",       8),
    ("load_balancer", "Load Balancer", "#0891b2", "generic",       9),
    ("cable_manager", "Cable Manager", "#78716c", "generic",       10),
    ("blade_chassis", "Blade Chassis", "#374151", "blade_chassis", 11),
    ("blade",         "Blade",         "#4f46e5", "blade",         12),
    ("other",         "Other",         "#6b7280", "generic",       13),
]


def upgrade() -> None:
    op.create_table(
        "device_types",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("icon_key", sa.String(50), nullable=True),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_device_types_name"),
    )
    op.create_index("ix_device_types_name", "device_types", ["name"], unique=True)

    # Seed built-in types
    for name, label, color, icon_key, sort_order in _BUILTIN_TYPES:
        op.execute(
            f"""
            INSERT INTO device_types (id, name, label, color, icon_key, is_builtin, sort_order, created_at, updated_at)
            VALUES (gen_random_uuid(), '{name}', '{label}', '{color}', '{icon_key}', TRUE, {sort_order}, now(), now())
            ON CONFLICT (name) DO NOTHING
            """
        )


def downgrade() -> None:
    op.drop_index("ix_device_types_name", table_name="device_types")
    op.drop_table("device_types")
