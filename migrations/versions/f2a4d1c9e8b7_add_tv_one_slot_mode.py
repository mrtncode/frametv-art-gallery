"""Add the per-TV 1-slot overwrite mode

Additive and off by default, so an existing database keeps behaving exactly as
before until this setting is switched on for a TV.

Checked first. The app calls db.create_all() when it starts, so on a fresh
install the column can already exist by the time alembic runs.

Revision ID: f2a4d1c9e8b7
Revises: e7a2c4f19b3d
Create Date: 2026-08-22 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f2a4d1c9e8b7'
down_revision = 'e7a2c4f19b3d'
branch_labels = None
depends_on = None


def _columns(table):
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    if 'one_slot_mode' not in _columns('tv'):
        with op.batch_alter_table('tv', schema=None) as batch_op:
            batch_op.add_column(
                sa.Column('one_slot_mode', sa.Boolean(), nullable=False, server_default=sa.text('0'))
            )


def downgrade():
    if 'one_slot_mode' in _columns('tv'):
        with op.batch_alter_table('tv', schema=None) as batch_op:
            batch_op.drop_column('one_slot_mode')
