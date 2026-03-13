"""Add corridors table; migrate racks from room_id to corridor_id

Revision ID: add_corridors
Revises: 8464c467a964
Create Date: 2026-03-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'add_corridors'
down_revision: Union[str, None] = '8464c467a964'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create corridors table
    op.create_table(
        'corridors',
        sa.Column('id', UUID(as_uuid=True), nullable=False),
        sa.Column('room_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_corridors_room_id', 'corridors', ['room_id'], unique=False)

    # 2. Insert one default corridor per room
    op.execute("""
        INSERT INTO corridors (id, room_id, name, position, notes, created_at, updated_at)
        SELECT gen_random_uuid(), id, 'Main Corridor', 1, NULL, now(), now()
        FROM rooms
    """)

    # 3. Add corridor_id (nullable) to racks
    op.add_column('racks', sa.Column('corridor_id', UUID(as_uuid=True), nullable=True))

    # 4. Populate corridor_id from the default corridor for each rack's room
    op.execute("""
        UPDATE racks
        SET corridor_id = c.id
        FROM corridors c
        WHERE c.room_id = racks.room_id
    """)

    # 5. Make corridor_id NOT NULL now that all rows are populated
    op.alter_column('racks', 'corridor_id', nullable=False)

    # 6. Add FK constraint and index for corridor_id
    op.create_foreign_key(
        'racks_corridor_id_fkey', 'racks', 'corridors',
        ['corridor_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_racks_corridor_id', 'racks', ['corridor_id'], unique=False)

    # 7. Drop old room_id FK, index, and column from racks
    op.execute("ALTER TABLE racks DROP CONSTRAINT IF EXISTS racks_room_id_fkey")
    op.drop_index('ix_racks_room_id', table_name='racks', if_exists=True)
    op.drop_column('racks', 'room_id')


def downgrade() -> None:
    # 1. Re-add room_id to racks (nullable first)
    op.add_column('racks', sa.Column('room_id', UUID(as_uuid=True), nullable=True))

    # 2. Populate room_id from corridor
    op.execute("""
        UPDATE racks
        SET room_id = c.room_id
        FROM corridors c
        WHERE c.id = racks.corridor_id
    """)

    # 3. Make room_id NOT NULL
    op.alter_column('racks', 'room_id', nullable=False)

    # 4. Add FK and index for room_id
    op.create_foreign_key(
        'racks_room_id_fkey', 'racks', 'rooms',
        ['room_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_racks_room_id', 'racks', ['room_id'], unique=False)

    # 5. Drop corridor_id FK, index, and column from racks
    op.drop_constraint('racks_corridor_id_fkey', 'racks', type_='foreignkey')
    op.drop_index('ix_racks_corridor_id', table_name='racks')
    op.drop_column('racks', 'corridor_id')

    # 6. Drop corridors table
    op.drop_index('ix_corridors_room_id', table_name='corridors')
    op.drop_table('corridors')
