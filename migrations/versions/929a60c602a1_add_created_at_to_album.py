"""Add created_at to Image

Revision ID: 929a60c602a1
Revises:
Create Date: 2026-02-21 16:03:42.932128
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '929a60c602a1'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "image",
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("image", "created_at")