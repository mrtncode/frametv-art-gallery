"""Remember where an image came from

Additive and nullable, so an existing database keeps behaving exactly as before: rows
that predate these columns have no recorded source. New uploads are marked "upload", and
images added through Discover record the source, its page, the title, the artist and the
license.

Every step checks first, for the same reason as the content-hash migration: the app calls
db.create_all() when it starts, so on a fresh install the table already has these columns
by the time alembic runs.

Revision ID: 8c1f0a52b7de
Revises: ce4757b9dde8
Create Date: 2026-10-02 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8c1f0a52b7de'
down_revision = 'ce4757b9dde8'
branch_labels = None
depends_on = None

COLUMNS = (
    ('source', sa.String(length=32)),
    ('source_id', sa.String(length=255)),
    ('source_url', sa.String(length=1000)),
    ('title', sa.String(length=255)),
    ('artist', sa.String(length=255)),
    ('license', sa.String(length=120)),
)


def _columns(table):
    return {column['name'] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade():
    missing = [(name, kind) for name, kind in COLUMNS if name not in _columns('image')]
    if missing:
        with op.batch_alter_table('image', schema=None) as batch_op:
            for name, kind in missing:
                batch_op.add_column(sa.Column(name, kind, nullable=True))


def downgrade():
    present = [name for name, _ in COLUMNS if name in _columns('image')]
    if present:
        with op.batch_alter_table('image', schema=None) as batch_op:
            for name in present:
                batch_op.drop_column(name)
