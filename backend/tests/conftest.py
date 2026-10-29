import os
import sys
import tempfile

# Keep uploads, the database and the thumbnail cache out of the working tree. This has
# to happen before app/utils.frame_tv are imported, since both read it at import time.
os.environ.setdefault(
    "FRAME_TV_DATA", os.path.join(tempfile.gettempdir(), "frametv-art-gallery-tests")
)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_discover_state(tmp_path, monkeypatch):
    """Discover keeps request budgets, cooldowns and cached searches on disk; give each
    test its own so one test's 403 or cached search never leaks into another."""
    from utils.discover.common import DiskCache
    from utils.discover.limits import Limiter

    monkeypatch.setattr(DiskCache, "directory", str(tmp_path / "discover-cache"))
    monkeypatch.setattr(Limiter, "directory", str(tmp_path / "discover-limits"))
