"""A fake network for the Discover tests: canned responses, nothing leaves the machine."""

import json as jsonlib

import requests


class FakeResponse:
    def __init__(self, data=None, *, status=200, content=b"", headers=None, url="https://fake.test/", text=None):
        self._data = data
        self.status_code = status
        self._content = content
        self.headers = headers or {}
        self.url = url
        self.text = text if text is not None else (jsonlib.dumps(data) if data is not None else "")

    @property
    def ok(self):
        return self.status_code < 400

    def json(self):
        return self._data

    def iter_content(self, chunk_size=8192):
        for start in range(0, len(self._content), chunk_size):
            yield self._content[start : start + chunk_size]

    def close(self):
        pass


class FakeNet:
    """Routes by URL substring; the first matching route wins. Records every call."""

    def __init__(self):
        self.routes = []
        self.calls = []

    def add(self, fragment, handler):
        """handler is a FakeResponse or a callable(url, params, json, headers) -> FakeResponse."""
        self.routes.append((fragment, handler))

    def _dispatch(self, method, url, params=None, json=None, headers=None):
        self.calls.append({"method": method, "url": url, "params": params, "json": json, "headers": headers})
        for fragment, handler in self.routes:
            if fragment in url:
                response = handler(url, params, json, headers) if callable(handler) else handler
                response.url = response.url if response.url != "https://fake.test/" else url
                return response
        raise AssertionError(f"Unexpected request: {method} {url}")

    def get(self, url, params=None, headers=None, stream=False, timeout=None):
        return self._dispatch("GET", url, params=params, headers=headers)

    def post(self, url, json=None, headers=None, timeout=None):
        return self._dispatch("POST", url, json=json, headers=headers)

    def install(self, monkeypatch):
        monkeypatch.setattr(requests, "get", self.get)
        monkeypatch.setattr(requests, "post", self.post)
        return self
