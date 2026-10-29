import os
import sys
import tempfile

# Keep uploads, the database and the thumbnail cache out of the working tree. This has
# to happen before app/utils.frame_tv are imported, since both read it at import time.
os.environ.setdefault(
    "FRAME_TV_DATA", os.path.join(tempfile.gettempdir(), "frametv-art-gallery-tests")
)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
