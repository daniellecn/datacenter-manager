"""add chassis fields to device_servers

Revision ID: 20260314_0001
Revises: 20260313_0001_add_device_types_table
Create Date: 2026-03-14

Adds three columns to device_servers to track blade chassis capacity:
  - total_blade_slots  : how many blade slots the chassis supports
  - ethernet_switch_modules : number of integrated Ethernet switch modules
  - fc_switch_modules  : number of integrated FC switch modules
"""
from alembic import op
import sqlalchemy as sa

revision = "20260314_0001"
down_revision = "add_device_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("device_servers", sa.Column("total_blade_slots", sa.SmallInteger(), nullable=True))
    op.add_column("device_servers", sa.Column("ethernet_switch_modules", sa.SmallInteger(), nullable=True))
    op.add_column("device_servers", sa.Column("fc_switch_modules", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("device_servers", "fc_switch_modules")
    op.drop_column("device_servers", "ethernet_switch_modules")
    op.drop_column("device_servers", "total_blade_slots")
