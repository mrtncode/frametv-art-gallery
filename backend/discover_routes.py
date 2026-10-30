"""Discover: search free, high-resolution art and import it ready for the Frame."""

import hashlib
import json
import logging
import os
import shutil
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from flask import Blueprint, Response, current_app, jsonify, request
from models import Album, AppSetting, Image, ProviderConfig, db
from utils.discover import (
    DEFAULT_ENABLED_SOURCES,
    SOURCES,
    configure,
    credentials,
    get_source,
    resolve_url,
    source_info,
)
from utils.discover.aggregate import cached_search, filter_results, highlights
from utils.discover.artic import AIC_HEADERS
from utils.discover.common import (
    DEFAULT_SHAPE,
    MAX_DOWNLOAD_BYTES,
    PAGE_SIZE,
    SHAPES,
    DiscoverError,
    http_get,
    prune_old_files,
    theme_query,
    theme_terms,
)
from utils.discover.crop import (
    FIT_FILL,
    FIT_WHOLE,
    inspect_image,
    is_exact_target,
    process_image,
    quality_label,
    quality_label_whole,
)
from utils.discover.jobs import JobStore
from utils.discover.seasons import seasonal_word
from werkzeug.utils import secure_filename

log = logging.getLogger(__name__)

discover_routes = Blueprint("discover_routes", __name__)

# Previews and logos the browser could not load straight from the source (some sites
# challenge cross-site image requests) are fetched here instead. Only these hosts.
THUMB_HOSTS = {
    "cdn.reframed.gallery", "www.reframed.gallery",
    "www.artic.edu",
    "images.metmuseum.org", "www.metmuseum.org",
    "openaccess-cdn.clevelandart.org", "www.clevelandart.org",
    "api.smk.dk", "iip.smk.dk", "iip-thumb.smk.dk", "open.smk.dk", "www.smk.dk",
    "upload.wikimedia.org", "thumb.wikimedia.org", "commons.wikimedia.org", "www.louvre.fr",
    "images-assets.nasa.gov", "images.nasa.gov",
    "ids.si.edu", "americanart.si.edu", "www.cooperhewitt.org", "www.si.edu",
    "live.staticflickr.com", "combo.staticflickr.com", "pixabay.com", "cdn.pixabay.com",
    "media.getty.edu", "www.nga.gov", "britishart.yale.edu", "www.getty.edu", "www.moma.org",
}
THUMB_MAX_BYTES = 8 * 1024 * 1024
THUMB_TTL_SECONDS = 7 * 24 * 3600
CACHE_RETENTION_SECONDS = 14 * 24 * 3600

# Two at a time keeps a burst of clicks from hammering a museum or the NAS.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="discover-import")


@discover_routes.record_once
def _configure(state):
    app = state.app
    cache_dir = os.path.join(app.config["INSTANCE_FOLDER"], "discover")
    configure(cache_dir)
    prune_old_files(cache_dir, CACHE_RETENTION_SECONDS)
    app.extensions["discover_jobs"] = JobStore(os.path.join(cache_dir, "jobs"))
    app.config["DISCOVER_TMP"] = os.path.join(cache_dir, "tmp")
    os.makedirs(app.config["DISCOVER_TMP"], exist_ok=True)


# --- Source keys, entered in Settings -------------------------------------------------

PREFIX = "discover:"
SETTING_KEY_ENABLED_SOURCES = "discover_enabled_sources"


def get_enabled_source_ids():
    try:
        setting = AppSetting.query.filter_by(key=SETTING_KEY_ENABLED_SOURCES).first()
        if setting and setting.value is not None:
            ids = json.loads(setting.value)
            if isinstance(ids, list):
                return [s_id for s_id in ids if isinstance(s_id, str) and s_id in SOURCES]
    except Exception:
        log.exception("Could not read enabled discover sources from database")
    # If there is no saved preference, return the recommended defaults
    return list(DEFAULT_ENABLED_SOURCES)


def set_enabled_source_ids(ids):
    valid_ids = []
    seen = set()
    for s_id in ids:
        if isinstance(s_id, str) and s_id in SOURCES and s_id not in seen:
            valid_ids.append(s_id)
            seen.add(s_id)
    setting = AppSetting.query.filter_by(key=SETTING_KEY_ENABLED_SOURCES).first()
    if not setting:
        setting = AppSetting(key=SETTING_KEY_ENABLED_SOURCES)
        db.session.add(setting)
    setting.value = json.dumps(valid_ids)
    db.session.commit()
    return valid_ids


def set_source_enabled(source_id, enabled):
    if source_id not in SOURCES:
        raise DiscoverError("Unknown source", 404)
    current = get_enabled_source_ids()
    if enabled:
        if source_id not in current:
            current.append(source_id)
    else:
        current = [s for s in current if s != source_id]
    set_enabled_source_ids(current)
    return source_id in current


def _load_credentials():
    rows = ProviderConfig.query.filter(ProviderConfig.provider.like(PREFIX + "%")).all()
    values = {}
    for row in rows:
        service = row.provider[len(PREFIX):]
        spec = credentials.SERVICES.get(service)
        if not spec:
            continue
        names = [name for name, _ in spec["fields"]]
        values[service] = {names[-1]: row.api_key or ""}
        if len(names) > 1:
            values[service][names[0]] = row.host or ""
    credentials.replace_all(values)


@discover_routes.before_request
def _refresh_credentials():
    if credentials.stale():
        try:
            _load_credentials()
        except Exception:  # the table may not exist yet; sources then report a missing key
            log.exception("Could not load the Discover keys")
            db.session.rollback()
            credentials.replace_all({})


@discover_routes.route("/api/discover/credentials/<service>", methods=["PUT"])
def api_discover_set_credentials(service):
    spec = credentials.SERVICES.get(service)
    if not spec:
        raise DiscoverError("Unknown service", 404)
    data = request.get_json(silent=True) or {}
    names = [name for name, _ in spec["fields"]]
    given = {name: str(data.get(name) or "").strip()[:200] for name in names}
    if not all(given.values()):
        raise DiscoverError("Fill in " + " and ".join(label for _, label in spec["fields"]))
    row = ProviderConfig.query.filter_by(provider=PREFIX + service).first()
    if not row:
        row = ProviderConfig(provider=PREFIX + service)
        db.session.add(row)
    row.api_key = given[names[-1]]
    row.host = given[names[0]] if len(names) > 1 else None
    row.enabled = True
    db.session.commit()
    _load_credentials()
    return jsonify(credentials.describe(service))


@discover_routes.route("/api/discover/credentials/<service>", methods=["DELETE"])
def api_discover_clear_credentials(service):
    if service not in credentials.SERVICES:
        raise DiscoverError("Unknown service", 404)
    ProviderConfig.query.filter_by(provider=PREFIX + service).delete()
    db.session.commit()
    _load_credentials()
    # Also turn off any sources that depend on this service
    for source in SOURCES.values():
        if getattr(source, "service", None) == service:
            set_source_enabled(source.id, False)
    return jsonify(credentials.describe(service))


@discover_routes.errorhandler(DiscoverError)
def _discover_error(error):
    body = {"error": str(error)}
    if error.retry_after:
        body["retry_after"] = error.retry_after
    return jsonify(body), error.status


def _store():
    return current_app.extensions["discover_jobs"]


def _int_arg(name, default, low, high):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        raise DiscoverError(f"{name} must be a number") from None
    return max(low, min(high, value))


# --- Browsing -----------------------------------------------------------------


@discover_routes.route("/api/discover/sources", methods=["GET"])
def api_discover_sources():
    enabled_set = set(get_enabled_source_ids())
    return jsonify(
        sources=[source_info(source, enabled=(source.id in enabled_set)) for source in SOURCES.values()],
        season=seasonal_word(),
    )


@discover_routes.route("/api/discover/sources/enabled", methods=["PUT"])
def api_discover_set_enabled_sources():
    data = request.get_json(silent=True) or {}
    if "enabled" in data:
        if not isinstance(data["enabled"], list):
            raise DiscoverError("enabled must be a list of source IDs", 400)
        enabled_ids = data["enabled"]
    elif "sources" in data:
        if not isinstance(data["sources"], dict):
            raise DiscoverError("sources must be an object mapping source ID to boolean", 400)
        current = set(get_enabled_source_ids())
        for sid, is_on in data["sources"].items():
            if is_on:
                current.add(sid)
            else:
                current.discard(sid)
        enabled_ids = list(current)
    else:
        raise DiscoverError("Expected 'enabled' list or 'sources' object", 400)

    updated_ids = set_enabled_source_ids(enabled_ids)
    enabled_set = set(updated_ids)
    return jsonify(
        enabled=updated_ids,
        sources=[source_info(source, enabled=(source.id in enabled_set)) for source in SOURCES.values()],
    )


@discover_routes.route("/api/discover/sources/<source_id>", methods=["PUT", "PATCH"])
def api_discover_update_source(source_id):
    if source_id not in SOURCES:
        raise DiscoverError("Unknown source", 404)
    data = request.get_json(silent=True) or {}
    if "enabled" not in data:
        raise DiscoverError("Missing 'enabled' parameter", 400)
    enabled = bool(data["enabled"])
    set_source_enabled(source_id, enabled)
    source = SOURCES[source_id]
    return jsonify(source_info(source, enabled=enabled))


@discover_routes.route("/api/discover/sources/reset", methods=["POST"])
def api_discover_reset_sources():
    updated_ids = set_enabled_source_ids(DEFAULT_ENABLED_SOURCES)
    enabled_set = set(updated_ids)
    return jsonify(
        enabled=updated_ids,
        sources=[source_info(source, enabled=(source.id in enabled_set)) for source in SOURCES.values()],
    )


@discover_routes.route("/api/discover/search", methods=["GET"])
def api_discover_search():
    source = get_source(request.args.get("source", ""))
    query = request.args.get("q", "").strip()[:200]
    page = _int_arg("page", 1, 1, 200)
    limit = _int_arg("limit", PAGE_SIZE, 1, PAGE_SIZE)
    paintings_only = request.args.get("paintings", "1") != "0"
    shape = request.args.get("shape", DEFAULT_SHAPE)
    if shape not in SHAPES:
        raise DiscoverError("shape must be one of: " + ", ".join(SHAPES))

    # An Explore theme sends a few words; each source gets them in the form it reads best.
    terms = theme_terms(query, request.args.get("terms"))
    search_text = theme_query(source, terms) if len(terms) > 1 else query

    # The source's own page is cached for a day; the filters are applied to it afterwards.
    raw, cached = cached_search(source, search_text, page, paintings_only)
    results, hidden = filter_results(raw["results"], shape, request.args.get("sharp") == "1")
    return jsonify(
        source=source.id,
        query=query,
        results=results[:limit],
        page=page,
        hidden=hidden,
        has_more=raw["has_more"] or len(results) > limit,
        total=raw["total"],
        cached=cached,
    )


@discover_routes.route("/api/discover/highlights", methods=["GET"])
def api_discover_highlights():
    """A few wide, sharp pictures from different sources for the hero, refreshed daily."""
    return jsonify(highlights(SOURCES))


@discover_routes.route("/api/discover/thumb", methods=["GET"])
def api_discover_thumb():
    """Fallback for previews and logos the browser could not load directly."""
    url = request.args.get("url", "")
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in THUMB_HOSTS:
        raise DiscoverError("That image cannot be loaded here")

    directory = os.path.join(current_app.config["INSTANCE_FOLDER"], "discover", "thumbs")
    os.makedirs(directory, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    body_path, type_path = os.path.join(directory, f"{key}.img"), os.path.join(directory, f"{key}.type")

    def cached():
        try:
            if time.time() - os.path.getmtime(body_path) > THUMB_TTL_SECONDS:
                return None
            with open(type_path, encoding="utf-8") as handle:
                content_type = handle.read()
            with open(body_path, "rb") as handle:
                return handle.read(), content_type
        except OSError:
            return None

    hit = cached()
    if hit is None:
        headers = AIC_HEADERS if parts.hostname.endswith("artic.edu") else None
        response = http_get(url, stream=True, headers=headers, allowed_hosts=THUMB_HOSTS)
        try:
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip()
            if not content_type.startswith("image/"):
                raise DiscoverError("The source did not return an image", 502)
            data = b""
            for chunk in response.iter_content(chunk_size=64 * 1024):
                data += chunk
                if len(data) > THUMB_MAX_BYTES:
                    raise DiscoverError("That image is too large to preview", 502)
        finally:
            response.close()
        with open(body_path, "wb") as handle:
            handle.write(data)
        with open(type_path, "w", encoding="utf-8") as handle:
            handle.write(content_type)
        hit = (data, content_type)

    return Response(hit[0], mimetype=hit[1], headers={"Cache-Control": "public, max-age=86400"})


@discover_routes.route("/api/discover/resolve", methods=["POST"])
def api_discover_resolve():
    """Identify the artwork behind a pasted page link (or a bookmarklet click)."""
    data = request.get_json(silent=True) or {}
    source_id, item_id = resolve_url(data.get("url"))
    item = get_source(source_id).get(item_id)
    return jsonify(source=source_id, id=item_id, artwork=item)


# --- Importing ----------------------------------------------------------------


@discover_routes.route("/api/discover/import", methods=["POST"])
def api_discover_import():
    data = request.get_json(silent=True) or {}
    source = get_source(str(data.get("source", "")))
    item_id = str(data.get("id", "")).strip()
    if not item_id or len(item_id) > 200:
        raise DiscoverError("Missing artwork id")
    fit = data.get("fit") or FIT_FILL
    if fit not in (FIT_FILL, FIT_WHOLE):
        raise DiscoverError("fit must be 'fill' or 'whole'")

    album_id = None
    if data.get("album_id") not in (None, ""):
        try:
            album_id = int(data["album_id"])
        except (TypeError, ValueError):
            raise DiscoverError("Invalid album") from None
        if db.session.get(Album, album_id) is None:
            raise DiscoverError("Album not found", 404)

    job = _store().create(source=source.id, item_id=item_id, fit=fit, title=None, artist=None)
    _executor.submit(
        _run_import, current_app._get_current_object(), job["id"], source.id, item_id, fit, album_id
    )
    return jsonify(job_id=job["id"]), 202


@discover_routes.route("/api/discover/jobs/<job_id>", methods=["GET"])
def api_discover_job(job_id):
    job = _store().get(job_id)
    if job is None:
        return jsonify(error="Unknown import"), 404
    return jsonify(job)


def _download(source, plan, destination, store, job_id):
    """Stream the file to disk, reporting progress as it arrives."""
    response = http_get(
        plan.url, stream=True, headers=plan.headers, allowed_hosts=source.download_hosts
    )
    try:
        total = int(response.headers.get("Content-Length") or 0) or None
        if total and total > MAX_DOWNLOAD_BYTES:
            raise DiscoverError("That file is too large to import")
        received, last_report = 0, 0.0
        with open(destination, "wb") as handle:
            for chunk in response.iter_content(chunk_size=64 * 1024):
                if not chunk:
                    continue
                received += len(chunk)
                if received > MAX_DOWNLOAD_BYTES:
                    raise DiscoverError("That file is too large to import")
                handle.write(chunk)
                now = time.monotonic()
                if now - last_report >= 0.2:
                    last_report = now
                    store.update(
                        job_id,
                        stage="downloading",
                        percent=round(8 + 77 * received / total) if total else None,
                        received_bytes=received,
                        total_bytes=total,
                        message="Downloading the full-resolution file",
                    )
        store.update(job_id, received_bytes=received, total_bytes=total or received)
    finally:
        response.close()


def _frame_ready(plan, fit, downloaded, work_dir):
    """Return (path, info) for a file that is ready for the Frame, processing if needed."""
    info = inspect_image(downloaded)
    if is_exact_target(info):
        info["quality"] = "tv_ready"
        return downloaded, info
    if plan.server_cropped:
        info["quality"] = (
            quality_label_whole(plan.width, plan.height) if fit == FIT_WHOLE
            else quality_label(info["width"])
        )
        return downloaded, info
    output = os.path.join(work_dir, "framed.jpg")
    return output, process_image(downloaded, output, fit)


def _unique_name(directory, stem, extension):
    candidate, counter = f"{stem}{extension}", 2
    while os.path.exists(os.path.join(directory, candidate)):
        candidate = f"{stem}-{counter}{extension}"
        counter += 1
    return candidate


def _file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _run_import(app, job_id, source_id, item_id, fit, album_id):
    store = app.extensions["discover_jobs"]
    work_dir = tempfile.mkdtemp(dir=app.config["DISCOVER_TMP"])
    try:
        source = get_source(source_id)
        store.update(job_id, state="running", stage="resolving", percent=3,
                     message=f"Looking up the artwork at {source.short_name}")
        plan = source.plan(item_id, fit)
        store.update(job_id, title=plan.title, artist=plan.artist, percent=8)

        downloaded = os.path.join(work_dir, "download")
        _download(source, plan, downloaded, store, job_id)

        store.update(job_id, stage="processing", percent=88, message="Preparing it for your Frame")
        final_path, info = _frame_ready(plan, fit, downloaded, work_dir)

        store.update(job_id, stage="saving", percent=95, message="Adding it to your gallery")
        with open(final_path, "rb") as handle:
            extension = ".png" if handle.read(8) == b"\x89PNG\r\n\x1a\n" else ".jpg"
        digest = _file_sha256(final_path)

        with app.app_context():
            twin = Image.query.filter_by(sha256=digest).first()
            upload_dir = app.config["UPLOAD_FOLDER"]
            if twin and os.path.isfile(os.path.join(upload_dir, twin.filename)):
                store.update(job_id, state="done", stage="done", percent=100,
                             message="Already in your gallery",
                             result={"filename": twin.filename, "duplicate_of": twin.filename,
                                     "album_id": None, **info})
                return

            stem = secure_filename(f"{plan.artist or 'Unknown'} - {plan.title or source_id} {source_id}")[:110]
            filename = _unique_name(upload_dir, stem or f"{source_id}-{item_id}", extension)
            shutil.move(final_path, os.path.join(upload_dir, filename))

            image = Image(
                filename=filename,
                sha256=digest,
                source=source_id,
                source_id=str(item_id)[:255],
                source_url=(plan.page_url or "")[:1000] or None,
                title=(plan.title or "")[:255] or None,
                artist=(plan.artist or "")[:255] or None,
                license=(plan.license or source.license_note)[:120],
            )
            if album_id:
                image.album = db.session.get(Album, album_id)
            db.session.add(image)
            db.session.commit()

        store.update(job_id, state="done", stage="done", percent=100, message="Added to your gallery",
                     result={"filename": filename, "duplicate_of": None, "album_id": album_id, **info})
    except (DiscoverError, ValueError) as exc:
        store.update(job_id, state="error", stage="error", message=str(exc), error=str(exc))
    except Exception:
        log.exception("Discover import failed for %s/%s", source_id, item_id)
        message = "Something went wrong importing that artwork"
        store.update(job_id, state="error", stage="error", message=message, error=message)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
