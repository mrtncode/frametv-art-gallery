"""Covers delete fallback paths for TVs that reject batch delete_list.

Run with: pytest tests/test_frame_tv_delete_fallback.py
"""

from samsungtvws.exceptions import ResponseError

from utils import frame_tv


class _ArtRejectsBatch:
    def __init__(self):
        self.deleted = []

    def delete_list(self, content_ids):
        raise ResponseError("`delete_image_list` request failed with error number -10")

    def delete(self, content_id):
        if content_id == "MISSING":
            raise ResponseError("`delete_image` request failed with error number -10")
        self.deleted.append(content_id)


class _Session:
    def __init__(self, art):
        self._art = art

    def art(self):
        return self._art


def test_delete_tv_images_falls_back_to_single_delete(monkeypatch):
    art = _ArtRejectsBatch()

    def fake_tv_call(ip, action_description, action, **kwargs):
        return action(_Session(art))

    monkeypatch.setattr(frame_tv, "_tv_call", fake_tv_call)

    deleted = frame_tv.delete_tv_images("192.0.2.200", ["MISSING", "A", "B"], token="tok")

    assert deleted == 3
    assert art.deleted == ["A", "B"]
