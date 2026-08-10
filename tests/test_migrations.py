"""Checks that the database is usable however it was created.

These run `flask db upgrade` in a subprocess against a throwaway data directory,
because that is what the container entrypoint does and the failure being guarded
against only appears there — the in-process fixtures elsewhere call create_all()
directly and never touch alembic.

Run with: pytest tests/test_migrations.py
"""

import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def head_revision() -> str:
    """The revision with nothing revising it."""
    versions = PROJECT_ROOT / "migrations" / "versions"
    revisions, parents = set(), set()
    for path in versions.glob("*.py"):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.startswith("revision ="):
                revisions.add(line.split("=", 1)[1].strip().strip("'\""))
            elif line.startswith("down_revision ="):
                parents.add(line.split("=", 1)[1].strip().strip("'\""))
    heads = revisions - parents
    assert len(heads) == 1, f"expected a single head, found {heads}"
    return heads.pop()


def run_upgrade(data_dir: Path):
    environment = {
        **os.environ,
        "FRAME_TV_DATA": str(data_dir),
        "FLASK_APP": "app.py",
    }
    return subprocess.run(
        [sys.executable, "-m", "flask", "db", "upgrade"],
        cwd=PROJECT_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
    )


def stamped_revision(data_dir: Path):
    connection = sqlite3.connect(data_dir / "instance" / "frametv.db")
    try:
        return [row[0] for row in connection.execute("SELECT version_num FROM alembic_version")]
    finally:
        connection.close()


@pytest.fixture
def data_dir():
    path = Path(tempfile.mkdtemp(prefix="frametv-migrations-"))
    yield path
    shutil.rmtree(path, ignore_errors=True)


def test_a_fresh_install_ends_up_at_head(data_dir):
    """The container has to boot on an empty volume, not just on an upgraded one."""
    result = run_upgrade(data_dir)
    assert result.returncode == 0, f"upgrade failed:\n{result.stderr[-2000:]}"
    assert stamped_revision(data_dir) == [head_revision()]


def test_a_fresh_install_is_stamped_rather_than_replayed(data_dir):
    """create_all() builds the whole schema, so the migrations must not run over it.

    Replaying them is what used to abort the first migration that rebuilds a table:
    alembic reflects it and finds columns create_all had already added.
    """
    result = run_upgrade(data_dir)
    assert "Running upgrade" not in result.stderr + result.stdout
    assert "stamp" in (result.stderr + result.stdout).lower()


def test_upgrading_twice_changes_nothing(data_dir):
    run_upgrade(data_dir)
    before = stamped_revision(data_dir)
    result = run_upgrade(data_dir)
    assert result.returncode == 0, f"second upgrade failed:\n{result.stderr[-2000:]}"
    assert stamped_revision(data_dir) == before


def test_an_existing_database_still_migrates(data_dir):
    """A volume from an older release must be carried forward, not stamped over."""
    run_upgrade(data_dir)
    head = head_revision()

    # Rewind to the previous revision to stand in for a database from an older image.
    database = data_dir / "instance" / "frametv.db"
    connection = sqlite3.connect(database)
    try:
        parents = {}
        for path in (PROJECT_ROOT / "migrations" / "versions").glob("*.py"):
            text = path.read_text(encoding="utf-8")
            revision = down = None
            for line in text.splitlines():
                if line.startswith("revision ="):
                    revision = line.split("=", 1)[1].strip().strip("'\"")
                elif line.startswith("down_revision ="):
                    down = line.split("=", 1)[1].strip().strip("'\"")
            parents[revision] = down
        previous = parents[head]
        connection.execute("UPDATE alembic_version SET version_num = ?", (previous,))
        connection.commit()
    finally:
        connection.close()

    result = run_upgrade(data_dir)
    assert result.returncode == 0, f"upgrade failed:\n{result.stderr[-2000:]}"
    assert stamped_revision(data_dir) == [head], "the pending migration should have run"
