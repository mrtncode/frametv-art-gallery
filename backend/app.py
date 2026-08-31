import base64
import hashlib
import shutil
import sqlite3
import tempfile
import zipfile
from flask import Flask, after_this_request, render_template, request, redirect, url_for, flash, send_file, send_from_directory, jsonify, Response
import os
from werkzeug.utils import secure_filename
from pathlib import Path
import sys
from flask_sqlalchemy import SQLAlchemy
from utils.crop_image import crop_image_file, CropImageError, get_preset_crop_box, CROP_PRESETS
from utils.thumbnails import get_or_create, parse_width
from samsungtvws.exceptions import HttpApiError, ResponseError
from samsungtvws import SamsungTVWS
from const import CONNECTION_NAME
from typing import Tuple, Optional
from datetime import datetime
from flask_migrate import Migrate
import importlib
from media_provider_routes import media_provider_routes
from provider_config_routes import provider_config_routes
import requests

try:
    from PIL import Image as PILImage
except ImportError:
    PILImage = None

# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Import TV control functions from the integration
REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from utils.tv_connection import DEFAULT_PORT
from utils.frame_tv import (
    upload_artwork,
    is_art_mode_on,
    is_tv_reachable,
    power_on,
    power_off,
    enable_art_mode,
    FrameTVError,
    FrameTVConnectionError,
    FrameTVTimeoutError,
    FrameTVUnavailableError,
    delete_all_images_from_tv,
    get_tv_gallery_images,
    get_tv_gallery_thumbnails,
    delete_tv_image,
    delete_tv_images,
    get_tv_device_info,
    play_uploaded_content,
    get_tv_gallery_thumbnail,
    set_token_observer,
)

DATA_DIR = os.environ.get("FRAME_TV_DATA", "data")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if getattr(sys, 'frozen', False):
    migrations_dir = os.path.join(sys._MEIPASS, 'migrations')
else:
    migrations_dir = os.path.join(BASE_DIR, 'migrations')

UPLOAD_FOLDER = os.path.join(DATA_DIR, "uploads")
INSTANCE_FOLDER = os.path.join(DATA_DIR, "instance")
BACKEND_PORT = int(os.environ.get('BACKEND_PORT', '5000'))

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(INSTANCE_FOLDER, exist_ok=True)

frametv_db_path = os.path.abspath(os.path.join(INSTANCE_FOLDER, 'frametv.db'))

# Downscaled copies of the uploads, rebuilt on demand and safe to delete.
THUMBNAIL_DIR = Path(INSTANCE_FOLDER).joinpath('thumbnails')

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app = Flask(__name__, static_folder="../frontend/build/client")
app.secret_key = os.environ.get('SECRET_KEY', 'frameartsecretkey')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_UPLOAD_SIZE_BYTES', str(20 * 1024 * 1024)))

# allow cross-origin requests from the dev server or any other origin when
# talking to the API directly.  This is useful during front-end development when the frontend runs on a different port/host.
try:
    from flask_cors import CORS
    CORS(app, resources={r"/api/*": {"origins": "*"}})
except ImportError:
    pass

# Fallback CORS headers for any route, so front-end dev or production can call /api and /uploads without CORS blocking.
@app.after_request
def add_cors_headers(response):
    response.headers.setdefault('Access-Control-Allow-Origin', '*')
    response.headers.setdefault('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.setdefault('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS,PUT,PATCH,DELETE')
    # Basic browser hardening headers to reduce XSS and related client-side risks.
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    return response

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{frametv_db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

from models import AppSetting, db, Album, Image, TV, UploadedImage, ProviderConfig
db.init_app(app)

# Import blueprints
app.register_blueprint(media_provider_routes)
app.register_blueprint(provider_config_routes)

# ...models are now imported from models.py...

migrate = Migrate(app, db, directory=migrations_dir)


# Create database
def init_db():
    """Ensure database and all tables exist."""
    with app.app_context():
        fresh = not os.path.exists(frametv_db_path)
        app.logger.info("Initializing database")
        db.create_all()
        if fresh:
            from flask_migrate import stamp
            stamp(revision='head')
            app.logger.info("New database created and stamped as up to date")
        else:
            app.logger.info("Database initialized")

# Initialize database on startup
init_db()

# One gunicorn worker out of several picks up the slideshow loop; see utils/slideshow.py.
app.config['SLIDESHOW_LOCK_PATH'] = os.path.join(INSTANCE_FOLDER, 'slideshow.lock')
if os.environ.get('FRAME_TV_SLIDESHOW', '1').lower() not in ('0', 'false', 'no'):
    from utils import slideshow as _slideshow

    _slideshow.start(
        app,
        db,
        (TV, Image, UploadedImage),
        play_uploaded_content,
        is_art_mode_on,
        (FrameTVError, OSError),
        (ResponseError,),
    )


# --- Helpers ---
def allowed_file(filename: str) -> bool:
    return isinstance(filename, str) and '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


UPLOAD_ROOT = Path(app.config['UPLOAD_FOLDER']).resolve()
STATIC_ROOT = Path(app.static_folder).resolve() if app.static_folder else None


def _log_exception(context: str, exc: Exception):
    app.logger.error("%s: %s", context, exc, exc_info=True)


def _remember_tv_token(ip: str, token: str) -> None:
    """Store a token the TV handed back, so the next connection is not a stranger.

    A Frame TV issues a fresh token when a client connects and stops honouring the
    previous one. The token was only ever read at pairing time, so every later
    connection presented a stale one and the set asked the user to allow the app
    again — every single time.
    """
    try:
        with app.app_context():
            tv = TV.query.filter_by(ip=ip).first()
            if tv is None or tv.token == token:
                return
            tv.token = token
            db.session.commit()
            app.logger.info('TV %s issued a new token; stored it', ip)
    except Exception:
        # Losing the new token costs one more pairing prompt, not the request.
        app.logger.warning('Could not store the new token for TV %s', ip, exc_info=True)


set_token_observer(_remember_tv_token)


def _error_response(public_message: str, status_code: int = 500):
    return {'error': public_message}, status_code


def _is_tv_missing_content_error(exc: Exception) -> bool:
    """Whether the TV reports that a content id no longer exists (-10)."""
    return isinstance(exc, ResponseError) and 'error number -10' in str(exc).lower()


def _normalized_upload_path(filename: str, must_exist: bool = False) -> Tuple[str, str]:
    if not filename or not isinstance(filename, str):
        raise ValueError('Invalid filename')
    normalized_name = secure_filename(filename)
    if not normalized_name or normalized_name != os.path.basename(normalized_name):
        raise ValueError('Invalid filename')
    if not allowed_file(normalized_name):
        raise ValueError('Invalid file type')

    candidate = (UPLOAD_ROOT / normalized_name).resolve()
    if candidate.parent != UPLOAD_ROOT:
        raise ValueError('Invalid filename')
    if must_exist and not candidate.is_file():
        raise FileNotFoundError('Image not found')
    return normalized_name, str(candidate)


def _normalized_static_path(path: str) -> Path:
    if STATIC_ROOT is None:
        raise ValueError('Static path not configured')
    normalized = (STATIC_ROOT / path).resolve()
    # Ensure the resulting path is the static root or contained within it
    if not (normalized == STATIC_ROOT or STATIC_ROOT in normalized.parents):
        raise ValueError('Invalid path')
    return normalized


def _forget_uploaded(tv, content_ids=None, keep=None) -> int:
    """Drop the record that images are on a TV once they are not.

    Every path that removes art from a TV has to come through here: a content id left
    behind makes the app offer to play something the set no longer has, which it
    answers with `select_image request failed with error number -10`.

    Pass `content_ids` to forget those, or `keep` to forget everything else.
    """
    query = UploadedImage.query.filter_by(tv_id=tv.id)
    if content_ids is not None:
        query = query.filter(UploadedImage.content_id.in_(list(content_ids)))
    elif keep is not None:
        query = query.filter(UploadedImage.content_id != keep)

    removed = query.delete(synchronize_session=False)
    db.session.commit()
    return removed


def _file_sha256(path: str) -> Optional[str]:
    """Content hash of a file, or None if it cannot be read."""
    digest = hashlib.sha256()
    try:
        with open(path, 'rb') as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                digest.update(chunk)
    except OSError:
        app.logger.warning('Could not hash %s', path, exc_info=True)
        return None
    return digest.hexdigest()


def _guess_image_mimetype(image_bytes: bytes) -> str:
    if image_bytes.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if image_bytes.startswith(b'GIF87a') or image_bytes.startswith(b'GIF89a'):
        return 'image/gif'
    if image_bytes.startswith(b'RIFF') and image_bytes[8:12] == b'WEBP':
        return 'image/webp'
    return 'application/octet-stream'

# --- Media Provider Integration ---
media_provider = None
def load_media_provider():
    global media_provider
    with app.app_context():
        config = ProviderConfig.query.filter_by(provider='immich', enabled=True).first()
        if config and config.api_key and config.host:
            try:
                ImmichProvider = importlib.import_module("utils.immich_provider").ImmichProvider
                port = config.port or 443
                media_provider = ImmichProvider(config.api_key, config.host, port)
                app.logger.info("Loaded Immich provider from DB config")
            except Exception as e:
                app.logger.exception("Failed to initialize Immich provider")
        else:
            media_provider = None

# Load provider at startup
load_media_provider()
app.media_provider = media_provider


# --- API Endpoints ---

import json
from packaging.version import parse as parse_version

@app.route('/api/status', methods=['GET'])
def backend_status():
    """Return a simple status message for health checks and update availability."""
    current_version = os.environ.get('FRAME_TV_VERSION', 'unknown')
    repo = 'mrtncode/frametv-art-gallery'
    
    cache_entry = AppSetting.query.filter_by(key='github_version_cache').first()
    
    now = datetime.now()
    use_cached = False
    cache_data = {}

    if cache_entry and cache_entry.value:
        try:
            cache_data = json.loads(cache_entry.value)
            last_fetched = cache_data.get('last_fetched', 0)
            
            # 24 hours = 86400 seconds
            if now.timestamp() - last_fetched < 86400:
                use_cached = True
        except Exception:
            app.logger.warning("Error parsing cached GitHub version data; will fetch fresh", exc_info=True)
    if use_cached:
        latest_version = cache_data.get('latest_version')
        changelog = cache_data.get('changelog')
    else:
        latest_version = None
        changelog = None
        url = f'https://api.github.com/repos/{repo}/releases/latest'
        
        try:
            headers = {"User-Agent": f"Flask-FrameTV/{current_version}"}
            response = requests.get(url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                data = response.json()
                latest_version = data.get('tag_name', 'unknown')
                changelog = data.get('body', '')
                
                new_cache_content = {
                    'last_fetched': now.timestamp(),
                    'latest_version': latest_version,
                    'changelog': changelog
                }
                
                if not cache_entry:
                    cache_entry = AppSetting(key='github_version_cache')
                    db.session.add(cache_entry)
                
                cache_entry.value = json.dumps(new_cache_content)
                db.session.commit()
            else:
                app.logger.warning(f"GitHub API responds with status {response.status_code}. Using cached version if available.")
                latest_version = cache_data.get('latest_version', 'unknown')
                changelog = cache_data.get('changelog', '')
                
        except Exception as e:
            app.logger.exception("Failed to check for updates against GitHub API")
            app.logger.warning("Using cached version as fallback.")
            latest_version = cache_data.get('latest_version', 'unknown')
            changelog = cache_data.get('changelog', '')

    update_available = False
    if current_version != 'unknown' and latest_version and latest_version != 'unknown':
        try:
            update_available = parse_version(latest_version) > parse_version(current_version)
        except Exception:
            app.logger.exception("Failed to parse version numbers")
            update_available = latest_version != current_version

    return jsonify({
        'status': 'ok', 
        'timestamp': now.isoformat(), 
        'update_available': update_available, 
        'current_version': current_version,
        'latest_version': latest_version, 
        'changelog': changelog
    }), 200

# List all uploaded images (not album-specific)
@app.route('/api/images', methods=['GET'])
def api_list_images():
    """
    List the uploaded filenames, newest first.
    Pass params "?q=" to search specific filenames or "?sort=" to change the default sorting
    """
    upload_folder = app.config['UPLOAD_FOLDER']
    files = [
        f for f in os.listdir(upload_folder)
        if os.path.isfile(os.path.join(upload_folder, f))
    ]

    query = (request.args.get('q') or '').strip().lower()
    if query:
        files = [f for f in files if query in f.lower()]

    added_at = {
        img.filename: img.created_at
        for img in Image.query.filter(Image.filename.in_(files)).all()
    } if files else {}

    def sort_key(filename):
        known = added_at.get(filename)
        if known is not None:
            return known.timestamp()
        try:
            return os.path.getmtime(os.path.join(upload_folder, filename))
        except OSError:
            return 0.0

    sort = request.args.get('sort')
    if sort == 'name':
        files.sort(key=str.lower)
    else:
        files.sort(key=sort_key, reverse=sort != 'oldest')

    return {'images': files}


@app.route('/api/backup', methods=['GET'])
def api_backup():
    """Download a zip of the uploads and the database."""
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    tmp_dir = tempfile.mkdtemp(prefix='frametv-backup-')
    archive_path = os.path.join(tmp_dir, f'frametv-backup-{stamp}.zip')

    try:
        db_snapshot = os.path.join(tmp_dir, 'frametv.db')
        source = sqlite3.connect(frametv_db_path)
        try:
            destination = sqlite3.connect(db_snapshot)
            try:
                source.backup(destination)
            finally:
                destination.close()
        finally:
            source.close()

        upload_folder = app.config['UPLOAD_FOLDER']
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            archive.write(db_snapshot, 'instance/frametv.db')
            for filename in sorted(os.listdir(upload_folder)):
                full = os.path.join(upload_folder, filename)
                if os.path.isfile(full):
                    archive.write(full, f'uploads/{filename}')

        @after_this_request
        def cleanup(response):
            shutil.rmtree(tmp_dir, ignore_errors=True)
            return response

        return send_file(archive_path, as_attachment=True, download_name=os.path.basename(archive_path))
    except Exception as e:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        _log_exception('Failed to build the backup archive', e)
        return _error_response('Failed to build the backup archive', 500)


@app.route('/api/images/reconcile', methods=['POST'])
def api_reconcile_images():
    """Realign the database with the uploads folder.

    Files can be added or removed underneath the app, and rows predating the hash
    column have none. This adds rows for untracked files, drops rows whose file is
    gone, and fills in missing hashes. Album membership is never touched.
    """
    upload_folder = app.config['UPLOAD_FOLDER']
    on_disk = {
        f for f in os.listdir(upload_folder)
        if os.path.isfile(os.path.join(upload_folder, f)) and allowed_file(f)
    }

    rows = Image.query.all()
    known = {img.filename for img in rows}

    removed = 0
    for img in rows:
        if img.filename not in on_disk:
            UploadedImage.query.filter_by(image_id=img.id).delete()
            db.session.delete(img)
            removed += 1

    added = 0
    for filename in sorted(on_disk - known):
        db.session.add(Image(filename=filename, sha256=_file_sha256(os.path.join(upload_folder, filename))))
        added += 1

    hashed = 0
    for img in rows:
        if img.filename in on_disk and not img.sha256:
            img.sha256 = _file_sha256(os.path.join(upload_folder, img.filename))
            hashed += 1

    db.session.commit()

    # Reported once the hashes exist, so the answer covers the whole library.
    duplicates = {}
    for img in Image.query.filter(Image.sha256.isnot(None)).order_by(Image.id).all():
        duplicates.setdefault(img.sha256, []).append(img.filename)
    duplicate_groups = [names for names in duplicates.values() if len(names) > 1]

    return {
        'added': added,
        'removed': removed,
        'hashed': hashed,
        'duplicate_groups': duplicate_groups,
    }


@app.route('/api/images/added_this_month', methods=['GET'])
def api_images_added_this_month():
    now = datetime.now()
    start_of_month = datetime(now.year, now.month, 1)
    count = Image.query.filter(Image.created_at >= start_of_month).count()
    return {'count': count}


@app.route('/api/images/<filename>', methods=['DELETE'])
def api_delete_image(filename):
    try:
        filename, file_path = _normalized_upload_path(filename)
    except ValueError:
        return {'error': 'Invalid filename'}, 400

    image = Image.query.filter_by(filename=filename).first()
    if not image:
        return {'error': 'Image not found'}, 404

    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        _log_exception(f"Failed to delete file {file_path}", e)

    UploadedImage.query.filter_by(image_id=image.id).delete()

    db.session.delete(image)
    db.session.commit()
    return {'success': True}


@app.route('/api/images/<filename>/crop', methods=['POST'])
def api_crop_image(filename):
    """Crop an image using direct coordinates or a preset.
    
    Accepts one of:
    - Direct crop: {x, y, width, height}
    - Preset crop: {preset: "640x480"}
    """
    # Get crop parameters from request
    data = request.get_json(silent=True) or {}
    try:
        _, image_path = _normalized_upload_path(filename, must_exist=True)
    except ValueError:
        return {'error': 'Invalid filename'}, 400
    except FileNotFoundError:
        return {'error': 'Image not found'}, 404

    try:
        # Check if using preset-based crop
        if 'preset' in data:
            preset_name = data.get('preset')
            x, y, width, height = get_preset_crop_box(image_path, preset_name)
        else:
            # Use direct coordinates
            x = data.get('x')
            y = data.get('y')
            width = data.get('width')
            height = data.get('height')
        
        # Perform the crop
        crop_image_file(image_path, x, y, width, height)
        return {'success': True}
    except FileNotFoundError:
        return {'error': 'Image not found'}, 404
    except ValueError as e:
        return {'error': str(e)}, 400
    except CropImageError as e:
        return {'error': str(e)}, 400
    except Exception as e:
        _log_exception('Failed to crop image', e)
        return _error_response('Failed to crop image', 500)


@app.route('/api/crop-presets', methods=['GET'])
def api_get_crop_presets():
    """Get available crop presets."""
    presets = [
        {'id': name, 'label': info['label'], 'width': info['width'], 'height': info['height']}
        for name, info in CROP_PRESETS.items()
    ]
    return {'presets': presets}


# Album API
@app.route('/api/albums', methods=['GET'])
def api_list_albums():
    albums = Album.query.all()
    result = []
    for album in albums:
        result.append({
            'id': album.id,
            'name': album.name,
            'images': [img.filename for img in album.images]
        })
    return {'albums': result}


@app.route('/api/albums', methods=['POST'])
def api_create_album():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return {'error': 'Album name required'}, 400
    if Album.query.filter_by(name=name).first():
        return {'error': 'Album already exists'}, 400
    album = Album(name=name)
    db.session.add(album)
    db.session.commit()
    return api_list_albums()

@app.route('/api/albums/<album_name>/add', methods=['POST'])
def api_add_image_to_album(album_name):
    """Assign one image ({"image": name}) or several ({"images": [...]}) to an album."""
    data = request.get_json(silent=True) or {}
    filenames = data.get('images')
    if filenames is None:
        single = data.get('image')
        filenames = [single] if single else []
    if not isinstance(filenames, list) or not all(isinstance(name, str) and name for name in filenames):
        return {'error': 'Invalid image list'}, 400
    if not filenames:
        return {'error': 'Image required'}, 400

    album = Album.query.filter_by(name=album_name).first()
    if not album:
        return {'error': 'Album not found'}, 404

    for image_filename in filenames:
        existing_image = Image.query.filter_by(filename=image_filename).first()
        if existing_image:
            existing_image.album = album
        else:
            db.session.add(Image(filename=image_filename, album=album))

    db.session.commit()
    return api_list_albums()

@app.route('/api/albums/<int:album_id>', methods=['GET'])
def api_get_album(album_id):
    album = Album.query.get(album_id)
    if not album:
        return {'error': 'Album not found'}, 404
    return {
        'album': {
            'id': album.id,
            'name': album.name,
            'images': [
                {
                    'id': img.id,
                    'filename': img.filename
                } for img in album.images
            ]
        }
    }

@app.route('/api/albums/<int:album_id>/images/<int:image_id>', methods=['DELETE'])
def api_remove_image_from_album(album_id, image_id):
    album = Album.query.get(album_id)
    if not album:
        return {'error': 'Album not found'}, 404
    image = Image.query.get(image_id)
    if not image or image.album_id != album.id:
        return {'error': 'Image not found in album'}, 404
    image.album_id = None
    db.session.commit()
    return api_get_album(album_id)

@app.route('/api/albums/<album_name>', methods=['DELETE'])
def api_delete_album(album_name):
    album = Album.query.filter_by(name=album_name).first()
    if not album:
        return {'error': 'Album not found'}, 404
    db.session.delete(album)
    db.session.commit()
    return api_list_albums()



@app.route('/api/upload', methods=['POST'])
def upload():
    """Upload an image to the gallery, optionally straight into an album."""
    if 'file' not in request.files:
        return {'error': 'No file part'}, 400
    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400
    if not file or not allowed_file(file.filename):
        return {'error': 'Invalid file type'}, 400

    album_id = request.form.get('album_id')
    album = None
    if album_id:
        try:
            album = Album.query.get(int(album_id))
        except (TypeError, ValueError):
            return {'error': 'Invalid album'}, 400
        if not album:
            return {'error': 'Album not found'}, 404

    try:
        filename, file_path = _normalized_upload_path(file.filename)
    except ValueError as e:
        return {'error': str(e)}, 400
    file.save(file_path)
    digest = _file_sha256(file_path)

    # Re-uploading the same filename overwrites the file, so reuse its row instead of
    # leaving a second one behind pointing at the same image.
    img = Image.query.filter_by(filename=filename).first()
    if not img:
        img = Image(filename=filename)
        db.session.add(img)

    # The same artwork under another name still uploads — silently dropping a file
    # someone asked for would be worse — but the caller is told, so it can say so.
    duplicate_of = None
    if digest:
        twin = Image.query.filter(
            Image.sha256 == digest, Image.filename != filename
        ).first()
        if twin and os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], twin.filename)):
            duplicate_of = twin.filename
        img.sha256 = digest

    if album:
        img.album = album
    db.session.commit()
    return {
        'success': True,
        'filename': filename,
        'album_id': album.id if album else None,
        'duplicate_of': duplicate_of,
    }
    
# --- Play Uploaded Image on TV ---
@app.route('/api/tv/play_uploaded', methods=['POST'])
def api_play_uploaded_image():
    """
    Play an image on a TV using the stored content_id, without re-uploading.
    Expects JSON: {"ip": ..., "filename": ...}
    """
    data = request.get_json()
    ip = data.get('ip')
    filename = data.get('filename')
    if not ip or not filename:
        return {'error': 'TV IP and filename required'}, 400
    tv = TV.query.filter_by(ip=ip).first()
    image = Image.query.filter_by(filename=filename).first()
    if not tv or not image:
        return {'error': 'TV or image not found'}, 404
    uploaded = UploadedImage.query.filter_by(tv_id=tv.id, image_id=image.id).first()
    if not uploaded:
        return {'error': 'Image not uploaded to this TV'}, 404
    content_id = uploaded.content_id
    token = tv.token if tv else None
    try:
        # Use frame_tv API to play by content_id (assume function exists)
        from utils.frame_tv import play_uploaded_content
        play_uploaded_content(ip, content_id, token=token)
        return {'success': True}
    except FrameTVError as e:
        _log_exception('Failed to play uploaded content', e)
        return _error_response('Failed to play uploaded content', 500)


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Serve an uploaded image, or a downscaled copy with ?w=<width>.

    Without the parameter this behaves exactly as before, so existing links keep
    returning the original file.
    """
    try:
        safe_name, source_path = _normalized_upload_path(filename, must_exist=True)
    except ValueError:
        return {'error': 'Invalid filename'}, 400
    except FileNotFoundError:
        return {'error': 'Image not found'}, 404

    width = parse_width(request.args.get('w'))
    if width:
        thumbnail = get_or_create(THUMBNAIL_DIR, source_path, safe_name, width)
        if thumbnail:
            return send_file(thumbnail, mimetype='image/jpeg', max_age=86400)

    return send_from_directory(app.config['UPLOAD_FOLDER'], safe_name)



# --- TV API endpoints ---
from flask import jsonify

# TV management endpoints
@app.route('/api/tvs', methods=['GET'])
def api_get_tvs():
    tvs = TV.query.all()
    return {'tvs': [
        {
            'ip': tv.ip,
            'name': tv.name,
            'mac': tv.mac,
            'delete_other_images_on_upload': getattr(tv, 'delete_other_images_on_upload', False),
            'one_slot_mode': bool(getattr(tv, 'one_slot_mode', False)),
            'slideshow_enabled': bool(getattr(tv, 'slideshow_enabled', False)),
            'slideshow_album_id': getattr(tv, 'slideshow_album_id', None),
            'slideshow_interval_minutes': getattr(tv, 'slideshow_interval_minutes', None),
            'default_matte': getattr(tv, 'default_matte', None),
        } for tv in tvs
    ]}

@app.route('/api/tvs/<ip>', methods=['PATCH'])
def api_update_tv(ip):
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return {'error': 'TV not found'}, 404
    data = request.get_json() or {}
    if 'delete_other_images_on_upload' in data:
        tv.delete_other_images_on_upload = bool(data['delete_other_images_on_upload'])
    if 'one_slot_mode' in data:
        tv.one_slot_mode = bool(data['one_slot_mode'])
    if 'default_matte' in data:
        tv.default_matte = (data['default_matte'] or '').strip() or None

    if 'slideshow_enabled' in data:
        tv.slideshow_enabled = bool(data['slideshow_enabled'])
    if 'slideshow_album_id' in data:
        album_id = data['slideshow_album_id']
        if album_id in (None, ''):
            tv.slideshow_album_id = None
        else:
            try:
                album = Album.query.get(int(album_id))
            except (TypeError, ValueError):
                return {'error': 'Invalid album'}, 400
            if not album:
                return {'error': 'Album not found'}, 404
            tv.slideshow_album_id = album.id
    if 'slideshow_interval_minutes' in data:
        raw = data['slideshow_interval_minutes']
        if raw in (None, ''):
            tv.slideshow_interval_minutes = None
        else:
            try:
                minutes = int(raw)
            except (TypeError, ValueError):
                return {'error': 'Interval must be a whole number of minutes'}, 400
            if minutes < 1:
                return {'error': 'Interval must be at least one minute'}, 400
            tv.slideshow_interval_minutes = minutes

    if tv.slideshow_enabled and not (tv.slideshow_album_id and tv.slideshow_interval_minutes):
        return {'error': 'Pick an album and an interval before enabling the slideshow'}, 400

    db.session.commit()
    return {'success': True}

@app.route('/api/tvs/discover', methods=['GET'])
def api_discover_tvs():
    """Attempt to discover TVs on the local network."""
    from utils.tv_discovery import TVDiscovery
    try:
        tv_discovery = TVDiscovery()
        discovered = tv_discovery.scan_network()
        return {'discovered': discovered}
    except Exception as e:
        _log_exception('Failed to discover TVs', e)
        return _error_response('Failed to discover TVs', 500)

@app.route('/api/tvs', methods=['POST'])
def api_add_tv():
    data = request.get_json()
    if not data or not data.get('ip'):
        return {'error': 'TV IP required'}, 400
    ip = data['ip']
    if TV.query.filter_by(ip=ip).first():
        return {'error': 'TV already exists'}, 400
    mac = data.get('mac')
    name = data.get('name')
    # Attempt to connect to TV and obtain token
    try:
        tvws = SamsungTVWS(host=ip, port=DEFAULT_PORT, name=CONNECTION_NAME)
        tvws.open()
        # Wait for pairing and token
        token = tvws.token
        tvws.close()
        # Extract token string if needed
        if isinstance(token, dict) and 'token' in token:
            token = token['token']
        elif hasattr(token, 'token'):
            token = token.token
        elif not isinstance(token, str):
            token = str(token)
        if not token or not isinstance(token, str) or not token.isdigit():
            return {'error': 'Token not obtained or invalid. Please accept pairing on your TV.'}, 403
    except FrameTVError as e:
        _log_exception('Failed to connect to TV', e)
        return _error_response('Failed to connect to TV', 500)
    except Exception as e:
        _log_exception('Unexpected error while adding TV', e)
        return _error_response('Unexpected error while adding TV', 500)
    tv = TV(ip=ip, name=name, mac=mac, token=token)
    db.session.add(tv)
    db.session.commit()
    return api_get_tvs()

@app.route('/api/tvs', methods=['DELETE'])
def api_remove_tv():
    data = request.get_json()
    ip = data.get('ip')
    if not ip:
        return {'error': 'TV IP required'}, 400
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return {'error': 'TV not found'}, 404
    db.session.delete(tv)
    db.session.commit()
    return api_get_tvs()

@app.route('/api/tv/send', methods=['POST'])
def api_send_to_tv():
    """ Upload an image to the TV """
    data = request.get_json()
    ip = data.get('ip')
    filename = data.get('filename')
    brightness = data.get('brightness')
    display = data.get('display', True)
    provider = data.get('provider')
    provider_id = data.get('provider_id')
    # provider_url is deprecated, but fallback if present
    provider_url = data.get('provider_url')
    if not ip or not filename:
        return {'error': 'TV IP and filename required'}, 400
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        filename, art_path = _normalized_upload_path(filename)
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        # If the file does not exist locally, try to fetch from media provider
        if not os.path.isfile(art_path) and (provider_id or provider_url):
            if not hasattr(app, 'media_provider') or not app.media_provider:
                return {'error': 'No media provider configured'}, 400
            try:
                # If provider is specified and is 'immich', use download_image_by_id
                if provider == 'immich' and provider_id:
                    app.media_provider.download_image_by_id_sync(provider_id, art_path)
                elif provider_url:
                    app.media_provider.download_image(provider_url, art_path)
                elif provider_id:
                    # fallback for other providers
                    app.media_provider.download_image_by_id_sync(provider_id, art_path)
            except Exception as e:
                _log_exception('Failed to fetch image from provider', e)
                return _error_response('Failed to fetch image from provider', 500)
        # Check TV option for deleting other images on upload
        delete_others = False
        if tv and hasattr(tv, 'delete_other_images_on_upload'):
            delete_others = bool(tv.delete_other_images_on_upload)

        one_slot_mode = bool(tv and getattr(tv, 'one_slot_mode', False))
        managed_content_ids = []
        if tv and one_slot_mode:
            managed_content_ids = [
                uploaded.content_id
                for uploaded in UploadedImage.query.filter_by(tv_id=tv.id).all()
                if uploaded.content_id
            ]
        # A matte named on the request wins; otherwise fall back to the TV's own
        # default. Neither given, and the kwarg is left out entirely so
        # upload_artwork's own "none" default applies, exactly as before this option
        # existed.
        matte = (data.get('matte') or '').strip() or (tv.default_matte if tv else None)
        matte_kwargs = {'matte': matte} if matte else {}
        # upload_artwork should return content_id
        content_id = upload_artwork(
            ip, art_path, brightness=brightness, display=display, token=token, delete_others=delete_others,
            **matte_kwargs
        )
        # Store UploadedImage record
        image = Image.query.filter_by(filename=filename).first()
        if image and tv and content_id:
            from sqlalchemy import and_
            content_id_str = str(content_id)
            exists = UploadedImage.query.filter(
                and_(UploadedImage.image_id == image.id, UploadedImage.tv_id == tv.id)
            ).first()
            if exists:
                # The TV assigns a fresh content id on every upload; keeping the old
                # one would point at something that no longer exists.
                exists.content_id = content_id_str
            else:
                db.session.add(UploadedImage(image_id=image.id, tv_id=tv.id, content_id=content_id_str))
            db.session.commit()

            # This option wipes everything else off the TV, so those records go too.
            if delete_others:
                _forget_uploaded(tv, keep=content_id_str)
            elif one_slot_mode:
                stale = [cid for cid in managed_content_ids if cid != content_id_str]
                cleared_stale = []
                for stale_content_id in stale:
                    try:
                        delete_tv_image(ip, stale_content_id, token=token)
                        cleared_stale.append(stale_content_id)
                    except ResponseError as e:
                        if _is_tv_missing_content_error(e):
                            # Some TVs answer -10 when a content id is already gone.
                            # Treat as cleared and stop retrying it forever.
                            app.logger.info(
                                'TV already missing stale managed image %s on %s, forgetting local record',
                                stale_content_id,
                                ip,
                            )
                            cleared_stale.append(stale_content_id)
                        else:
                            _log_exception('Failed to prune a managed image in 1-slot mode', e)
                            continue
                    except (FrameTVError, FrameTVConnectionError, FrameTVTimeoutError, FrameTVUnavailableError, HttpApiError) as e:
                        _log_exception('Failed to prune a managed image in 1-slot mode', e)
                        break

                if stale and len(cleared_stale) == len(stale):
                    _forget_uploaded(tv, keep=content_id_str)
                elif cleared_stale:
                    _forget_uploaded(tv, content_ids=cleared_stale)
        return jsonify({'success': True, 'content_id': content_id})
    except (FrameTVError, HttpApiError) as e:
        _log_exception('Failed to send artwork to TV', e)
        return jsonify({'error': 'Failed to send artwork to TV'}), 500
    except (ResponseError) as e:
        _log_exception('TV rejected request while sending artwork', e)
        return jsonify({'error': 'TV rejected the request'}), 400
    except Exception as e:
        _log_exception('Unexpected error while sending artwork to TV', e)
        return jsonify({'error': 'Unexpected error'}), 500
    
@app.route("/api/tv/<ip>/images", methods=['DELETE'])
def api_remove_all_tv_images(ip):
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        delete_all_images_from_tv(ip, token=tv.token)
        _forget_uploaded(tv, content_ids=[u.content_id for u in tv.uploaded_images])
        return jsonify({'success': True})
    except FrameTVUnavailableError as e:
        # Another operation held the TV for the whole wait — nothing was deleted, and
        # retrying once the TV is free is all this needs.
        db.session.rollback()
        app.logger.info('Could not remove all images: %s', e)
        return jsonify({'error': 'The TV is busy with another request, try again', 'tv_busy': True}), 503
    except Exception as e:
        db.session.rollback()
        _log_exception('Failed to remove all images from TV', e)
        return jsonify({'error': 'Failed to remove all images from TV'}), 500

@app.route("/api/tv/<ip>/gallery", methods=['GET'])
def api_get_tv_gallery(ip):
    """Get list of images currently on the TV."""
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        images = get_tv_gallery_images(ip, token=tv.token)

        # The TV does not report a filename, so entries show as "Unknown". Anything
        # sent from here was recorded with its content id, which gives the real name
        # back; the rest keep the id, which at least identifies them.
        known = {
            uploaded.content_id: image.filename
            for uploaded, image in db.session.query(UploadedImage, Image)
            .join(Image, UploadedImage.image_id == Image.id)
            .filter(UploadedImage.tv_id == tv.id)
            .all()
        }
        for entry in images:
            if not entry.get('filename'):
                entry['filename'] = known.get(entry['content_id'], entry['content_id'])

        return jsonify({'images': images, 'tv_ip': ip})
    except FrameTVUnavailableError as e:
        app.logger.info('Skipping TV gallery: %s', e)
        return jsonify({'error': 'TV is unavailable', 'tv_unavailable': True}), 503
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while fetching TV gallery', e)
        return jsonify({'error': 'TV request timed out'}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV gallery connection failed', e)
        return jsonify({'error': 'TV is unavailable'}), 503
    except Exception as e:
        _log_exception('Failed to fetch TV gallery', e)
        return jsonify({'error': 'Failed to fetch TV gallery'}), 500

@app.route("/api/tv/<ip>/gallery/<content_id>/play", methods=['POST'])
def api_play_tv_image(ip, content_id):
    """Play a specific image from the TV gallery."""
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        # Enable art mode first
        enable_art_mode(ip, token=tv.token)
        # Play the image
        play_uploaded_content(ip, content_id, token=tv.token)
        return jsonify({'success': True})
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while playing TV image', e)
        return jsonify({'error': 'TV request timed out'}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while playing image', e)
        return jsonify({'error': 'TV is unavailable'}), 503
    except FrameTVError as e:
        _log_exception('Failed to play TV image', e)
        return jsonify({'error': 'Failed to play image'}), 500
    except Exception as e:
        _log_exception('Unexpected error playing TV image', e)
        return jsonify({'error': 'Unexpected error'}), 500

@app.route("/api/tv/<ip>/gallery/delete", methods=['POST'])
def api_delete_tv_images(ip):
    """Delete several images from the TV at once.

    POST rather than DELETE with a body, since a body on DELETE is easy for proxies
    to drop. The TV takes the whole list in one call.
    """
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404

    data = request.get_json(silent=True) or {}
    content_ids = data.get('content_ids')
    if not isinstance(content_ids, list) or not all(isinstance(c, str) and c for c in content_ids):
        return jsonify({'error': 'content_ids must be a list of strings'}), 400
    if not content_ids:
        return jsonify({'deleted': 0})

    try:
        deleted = delete_tv_images(ip, content_ids, token=tv.token)
        _forget_uploaded(tv, content_ids=content_ids)
        return jsonify({'deleted': deleted})
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while deleting TV images', e)
        return jsonify({'error': 'TV request timed out'}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while deleting images', e)
        return jsonify({'error': 'TV is unavailable'}), 503
    except Exception as e:
        _log_exception('Failed to delete TV images', e)
        return jsonify({'error': 'Failed to delete the images'}), 500


@app.route("/api/tv/<ip>/info", methods=['GET'])
def api_tv_device_info(ip):
    """What the TV reports about itself, verbatim.

    Diagnostic: the art API has no storage endpoint, so this is where a capacity
    figure would have to appear if the firmware exposes one at all.
    """
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        return jsonify({'device_info': get_tv_device_info(ip, token=tv.token)})
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while reading device info', e)
        return jsonify({'error': 'TV is unavailable'}), 503
    except Exception as e:
        _log_exception('Failed to read TV device info', e)
        return jsonify({'error': 'Failed to read device info'}), 500


@app.route("/api/tv/<ip>/gallery/thumbnails", methods=['POST'])
def api_tv_gallery_thumbnails(ip):
    """Return several thumbnails at once, as {content_id: base64}.

    A Frame TV serves one art channel at a time, so asking for a page of thumbnails
    one request at a time made the requests reject each other. This is one round trip.
    """
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404

    data = request.get_json(silent=True) or {}
    content_ids = data.get('content_ids')
    if not isinstance(content_ids, list) or not all(isinstance(c, str) and c for c in content_ids):
        return jsonify({'error': 'content_ids must be a list of strings'}), 400
    if len(content_ids) > 500:
        return jsonify({'error': 'Too many content ids'}), 400
    if not content_ids:
        return jsonify({'thumbnails': {}})

    try:
        thumbnails = get_tv_gallery_thumbnails(ip, content_ids, token=tv.token)
        return jsonify({
            'thumbnails': {
                cid: base64.b64encode(data).decode('ascii') for cid, data in thumbnails.items()
            }
        })
    except FrameTVUnavailableError as e:
        app.logger.info('Skipping TV thumbnails: %s', e)
        return jsonify({'error': 'TV is unavailable', 'tv_unavailable': True}), 503
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while fetching TV thumbnails', e)
        return jsonify({'error': 'TV request timed out', 'tv_unavailable': True}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while fetching thumbnails', e)
        return jsonify({'error': 'TV is unavailable', 'tv_unavailable': True}), 503
    except Exception as e:
        _log_exception('Failed to fetch TV thumbnails', e)
        return jsonify({'error': 'Failed to fetch thumbnails'}), 500


@app.route("/api/tv/<ip>/gallery/<content_id>/thumbnail", methods=['GET'])
def api_tv_gallery_thumbnail(ip, content_id):
    """Return a thumbnail image for a TV gallery item."""
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        thumbnail = get_tv_gallery_thumbnail(ip, content_id, token=tv.token)
        if not thumbnail:
            return jsonify({'error': 'Thumbnail not found'}), 404
        return Response(thumbnail, mimetype=_guess_image_mimetype(thumbnail))
    except FrameTVUnavailableError as e:
        # The circuit breaker refusing a call is the design working, and a gallery page
        # trips it once per thumbnail. One line, no stack trace.
        app.logger.info('Skipping TV thumbnail: %s', e)
        return jsonify({'error': 'TV is unavailable', 'tv_unavailable': True}), 503
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while fetching TV thumbnail', e)
        return jsonify({'error': 'TV request timed out', 'tv_unavailable': True}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while fetching thumbnail', e)
        return jsonify({'error': 'TV is unavailable', 'tv_unavailable': True}), 503
    except Exception as e:
        _log_exception('Failed to fetch TV thumbnail', e)
        return jsonify({'error': 'Failed to fetch thumbnail'}), 500

@app.route("/api/tv/<ip>/gallery/<content_id>", methods=['DELETE'])
def api_delete_tv_image(ip, content_id):
    """Delete a specific image from the TV gallery."""
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return jsonify({'error': 'TV not found'}), 404
    try:
        delete_tv_image(ip, content_id, token=tv.token)
        _forget_uploaded(tv, content_ids=[content_id])
        return jsonify({'success': True})
    except FrameTVTimeoutError as e:
        _log_exception('Timeout while deleting TV image', e)
        return jsonify({'error': 'TV request timed out'}), 504
    except FrameTVConnectionError as e:
        _log_exception('TV connection failed while deleting TV image', e)
        return jsonify({'error': 'TV is unavailable'}), 503
    except Exception as e:
        _log_exception('Failed to delete TV image', e)
        return jsonify({'error': 'Failed to delete image'}), 500


@app.route('/api/tv/<ip>/on', methods=['POST'])
def api_tv_power_on(ip):
    data = request.get_json(silent=True) or {}
    mac = data.get('mac')
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        power_on(ip, mac, token=token)
        return {'success': True}
    except FrameTVError as e:
        _log_exception('Failed to power on TV', e)
        return _error_response('Failed to power on TV', 500)

@app.route('/api/tv/<ip>/off', methods=['POST'])
def api_tv_power_off(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        power_off(ip, token=token)
        return {'success': True}
    except FrameTVError as e:
        _log_exception('Failed to power off TV', e)
        return _error_response('Failed to power off TV', 500)

@app.route('/api/tv/<ip>/artmode', methods=['POST'])
def api_tv_art_mode(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        enable_art_mode(ip, token=token)
        return {'success': True}
    except FrameTVError as e:
        _log_exception('Failed to enable art mode', e)
        return _error_response('Failed to enable art mode', 500)

@app.route('/api/tv/<ip>/status', methods=['GET'])
def api_tv_status(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        art_mode = is_art_mode_on(ip, token=token)
        screen_on = is_tv_reachable(ip, token=token)
        return {'art_mode': art_mode, 'screen_on': screen_on}
    except FrameTVError as e:
        _log_exception('Failed to get TV status', e)
        return _error_response('Failed to get TV status', 500)

@app.route('/tv/<ip>/on', methods=['POST'])
def tv_power_on(ip):
    mac = request.form.get('mac')
    try:
        power_on(ip, mac)
        flash(f'TV {ip} powered on')
    except FrameTVError as e:
        flash(f'Error: {e}')
    return redirect(url_for('index'))

@app.route('/tv/<ip>/off', methods=['POST'])
def tv_power_off(ip):
    try:
        power_off(ip)
        flash(f'TV {ip} powered off')
    except FrameTVError as e:
        flash(f'Error: {e}')
    return redirect(url_for('index'))

@app.route('/tv/<ip>/artmode', methods=['POST'])
def tv_art_mode(ip):
    try:
        enable_art_mode(ip)
        flash(f'TV {ip} set to art mode')
    except FrameTVError as e:
        flash(f'Error: {e}')
    return redirect(url_for('index'))

@app.route('/tv/<ip>/status')
def tv_status(ip):
    try:
        art_mode = is_art_mode_on(ip)
        screen_on = is_tv_reachable(ip)
        return {
            'art_mode': art_mode,
            'screen_on': screen_on
        }
    except FrameTVError as e:
        _log_exception('Failed to get TV status', e)
        return _error_response('Failed to get TV status', 500)
    
# Place at the bottom for lowest priority 
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    try:
        static_file_path = _normalized_static_path(path)
    except ValueError:
        return _error_response('Invalid path', 400)

    if os.path.isfile(static_file_path):
        return send_from_directory(app.static_folder, path)
    # Always serve index.html for any unknown route (client-side routing)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    if "--upgrade-db" in sys.argv:
        from flask_migrate import upgrade

        with app.app_context():
            upgrade(directory=migrations_dir)
            
        print("Database upgrade completed.")

    # Use DEBUG env variable ("1", "true", "True" = True)
    debug_env = os.environ.get('DEBUG', '').lower()
    debug = debug_env in ('1', 'true', 'yes')
    app.run(debug=debug, host="0.0.0.0", port=BACKEND_PORT)
