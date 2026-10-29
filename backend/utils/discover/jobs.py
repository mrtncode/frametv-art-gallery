"""Import progress shared between processes.

gunicorn runs several worker processes, and the request that polls for progress is not
guaranteed to reach the one doing the download, so job state lives in small JSON files.
"""

import json
import os
import re
import threading
import time
import uuid

JOB_TTL_SECONDS = 3600
_JOB_ID = re.compile(r"^[0-9a-f]{32}$")


class JobStore:
    def __init__(self, directory):
        self.directory = directory
        os.makedirs(directory, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, job_id):
        if not isinstance(job_id, str) or not _JOB_ID.match(job_id):
            raise KeyError(job_id)
        return os.path.join(self.directory, f"{job_id}.json")

    def _write(self, job):
        path = self._path(job["id"])
        temp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
        with open(temp, "w", encoding="utf-8") as handle:
            json.dump(job, handle)
        os.replace(temp, path)

    def create(self, **fields):
        self.prune()
        job = {
            "id": uuid.uuid4().hex,
            "state": "queued",
            "stage": "queued",
            "percent": 0,
            "received_bytes": 0,
            "total_bytes": None,
            "message": "Waiting to start",
            "result": None,
            "error": None,
            **fields,
        }
        job["updated_at"] = time.time()
        self._write(job)
        return job

    def update(self, job_id, **fields):
        with self._lock:
            job = self.get(job_id)
            if job is None:
                return None
            job.update(fields)
            job["updated_at"] = time.time()
            self._write(job)
            return job

    def get(self, job_id):
        try:
            with open(self._path(job_id), encoding="utf-8") as handle:
                return json.load(handle)
        except (KeyError, OSError, ValueError):
            return None

    def prune(self):
        cutoff = time.time() - JOB_TTL_SECONDS
        try:
            names = os.listdir(self.directory)
        except OSError:
            return
        for name in names:
            path = os.path.join(self.directory, name)
            try:
                if os.path.getmtime(path) < cutoff:
                    os.remove(path)
            except OSError:
                pass
