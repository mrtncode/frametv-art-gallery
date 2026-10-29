"""Keys for the Discover sources that need one, entered in Settings and kept in the database.

Sources read them through ``get`` while serving a request. The routes reload them from the
database every few seconds and straight after a save, so every worker process sees a change
soon after it is made. Secrets are never sent back to the browser: it is only told whether
one is set.
"""

import threading
import time

# service -> what to ask for and where to get it
SERVICES = {
    "smithsonian": {
        "label": "Smithsonian",
        "fields": [("api_key", "API key")],
        "help_url": "https://api.data.gov/signup/",
    },
    "flickr": {
        "label": "Flickr",
        "fields": [("api_key", "API key")],
        "help_url": "https://www.flickr.com/services/apps/create/apply/",
    },
    "pixabay": {
        "label": "Pixabay",
        "fields": [("api_key", "API key")],
        "help_url": "https://pixabay.com/api/docs/",
    },
    "deviantart": {
        "label": "DeviantArt",
        "fields": [("client_id", "Client ID"), ("client_secret", "Client secret")],
        "help_url": "https://www.deviantart.com/developers/apps",
    },
}

RELOAD_SECONDS = 5

_values = {}
_loaded_at = 0.0
_lock = threading.Lock()


def get(service, field="api_key"):
    return (_values.get(service) or {}).get(field, "")


def configured(service):
    spec = SERVICES.get(service)
    return bool(spec) and all(get(service, name) for name, _ in spec["fields"])


def replace_all(values):
    """Swap in what the database holds. ``values`` maps service -> {field: value}."""
    global _loaded_at
    with _lock:
        _values.clear()
        _values.update({service: dict(fields) for service, fields in values.items() if service in SERVICES})
        _loaded_at = time.time()


def stale():
    return time.time() - _loaded_at > RELOAD_SECONDS


def describe(service):
    """What the front end may know about a service: its fields and whether they are set."""
    spec = SERVICES.get(service)
    if not spec:
        return None
    return {
        "service": service,
        "label": spec["label"],
        "help_url": spec["help_url"],
        "fields": [{"name": name, "label": label} for name, label in spec["fields"]],
        "configured": configured(service),
    }
