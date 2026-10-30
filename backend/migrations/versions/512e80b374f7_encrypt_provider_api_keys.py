"""Encrypt provider API keys

Revision ID: 512e80b374f7
Revises: 8c1f0a52b7de
Create Date: 2026-10-30 14:16:18.540200
"""

from alembic import op
import sqlalchemy as sa


revision = '512e80b374f7'
down_revision = '8c1f0a52b7de'
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("provider_config")
    }

    with op.batch_alter_table("provider_config") as batch_op:
        if "api_key_encrypted" not in columns:
            batch_op.add_column(
                sa.Column("api_key_encrypted", sa.Text(), nullable=True)
            )

        if "api_key" in columns:
            batch_op.drop_column("api_key")


def downgrade():
    inspector = sa.inspect(op.get_bind())
    columns = {
        column["name"]
        for column in inspector.get_columns("provider_config")
    }

    with op.batch_alter_table("provider_config") as batch_op:
        if "api_key" not in columns:
            batch_op.add_column(
                sa.Column("api_key", sa.VARCHAR(length=255), nullable=True)
            )

        if "api_key_encrypted" in columns:
            batch_op.drop_column("api_key_encrypted")