from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory, jsonify
import os
from werkzeug.utils import secure_filename
from pathlib import Path
import sys
from flask_sqlalchemy import SQLAlchemy
from utils.frame_tv import SamsungTVWS, FrameTVError, DEFAULT_PORT
from utils.crop_image import crop_image_file, CropImageError, get_preset_crop_box, CROP_PRESETS
from samsungtvws.exceptions import HttpApiError, ResponseError
from const import CONNECTION_NAME
from datetime import datetime
from flask_migrate import Migrate
import importlib
from media_provider_routes import media_provider_routes
from provider_config_routes import provider_config_routes

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

from utils.frame_tv import (
    upload_artwork,
    is_art_mode_on,
    is_tv_reachable,
    power_on,
    power_off,
    enable_art_mode,
    FrameTVError,
    delete_all_images_from_tv
)

DATA_DIR = os.environ.get("FRAME_TV_DATA", "data")

UPLOAD_FOLDER = os.path.join(DATA_DIR, "uploads")
INSTANCE_FOLDER = os.path.join(DATA_DIR, "instance")

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(INSTANCE_FOLDER, exist_ok=True)

frametv_db_path = os.path.abspath(os.path.join(INSTANCE_FOLDER, 'frametv.db'))

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app = Flask(__name__, static_folder="frontend/build/client")
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

from models import db, Album, Image, TV, UploadedImage, ProviderConfig
db.init_app(app)

# Import blueprints
app.register_blueprint(media_provider_routes)
app.register_blueprint(provider_config_routes)

# ...models are now imported from models.py...

# Create database
def init_db():
    """Ensure database and all tables exist."""
    with app.app_context():
        print("Initializing database...")
        db.create_all()
        print("Database initialized.")

# Initialize database on startup
init_db()
migrate = Migrate(app, db)


# --- Helpers ---
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


UPLOAD_ROOT = Path(app.config['UPLOAD_FOLDER']).resolve()
STATIC_ROOT = Path(app.static_folder).resolve() if app.static_folder else None


def _log_exception(context: str, exc: Exception):
    app.logger.error("%s: %s", context, exc, exc_info=True)


def _error_response(public_message: str, status_code: int = 500):
    return {'error': public_message}, status_code


def _normalized_upload_path(filename: str, must_exist: bool = False):
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


def _normalized_static_path(path: str):
    if STATIC_ROOT is None:
        raise ValueError('Static path not configured')
    normalized = (STATIC_ROOT / path).resolve()
    if normalized != STATIC_ROOT and STATIC_ROOT not in normalized.parents:
        raise ValueError('Invalid path')
    return normalized

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
                print("Loaded Immich provider from DB config")
            except Exception as e:
                print(f"Failed to initialize Immich provider: {e}")
        else:
            media_provider = None

# Load provider at startup
load_media_provider()
app.media_provider = media_provider


# --- API Endpoints ---

# List all uploaded images (not album-specific)
@app.route('/api/images', methods=['GET'])
def api_list_images():
    files = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) if os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
    return {'images': files}


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
    data = request.get_json()
    image_filename = data.get('image')
    if not image_filename:
        return {'error': 'Image required'}, 400
    album = Album.query.filter_by(name=album_name).first()
    if not album:
        return {'error': 'Album not found'}, 404

    existing_image = Image.query.filter_by(filename=image_filename).first()
    if existing_image and existing_image.album_id == album.id:
        return api_list_albums()

    if existing_image:
        existing_image.album = album
    else:
        existing_image = Image(filename=image_filename, album=album)
        db.session.add(existing_image)

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
    """ Upload image to the gallery """
    if 'file' not in request.files:
        return {'error': 'No file part'}, 400
    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400
    if file and allowed_file(file.filename):
        try:
            filename, file_path = _normalized_upload_path(file.filename)
        except ValueError as e:
            return {'error': str(e)}, 400
        file.save(file_path)
        # Track image in DB
        img = Image(filename=filename, album_id=None)
        db.session.add(img)
        db.session.commit()
        return {'success': True, 'filename': filename}
    else:
        return {'error': 'Invalid file type'}, 400
    
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
    try:
        safe_name, _ = _normalized_upload_path(filename, must_exist=True)
    except ValueError:
        return {'error': 'Invalid filename'}, 400
    except FileNotFoundError:
        return {'error': 'Image not found'}, 404
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
            'delete_other_images_on_upload': getattr(tv, 'delete_other_images_on_upload', False)
        } for tv in tvs
    ]}

@app.route('/api/tvs/<ip>', methods=['PATCH'])
def api_update_tv(ip):
    tv = TV.query.filter_by(ip=ip).first()
    if not tv:
        return {'error': 'TV not found'}, 404
    data = request.get_json()
    if 'delete_other_images_on_upload' in data:
        tv.delete_other_images_on_upload = bool(data['delete_other_images_on_upload'])
    db.session.commit()
    return {'success': True}

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
        # upload_artwork should return content_id
        content_id = upload_artwork(
            ip, art_path, brightness=brightness, display=display, token=token, delete_others=delete_others
        )
        # Store UploadedImage record
        image = Image.query.filter_by(filename=filename).first()
        if image and tv and content_id:
            from sqlalchemy import and_
            exists = UploadedImage.query.filter(
                and_(UploadedImage.image_id == image.id, UploadedImage.tv_id == tv.id)
            ).first()
            if not exists:
                uploaded = UploadedImage(image_id=image.id, tv_id=tv.id, content_id=str(content_id))
                db.session.add(uploaded)
                db.session.commit()
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
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        _log_exception('Failed to remove all images from TV', e)
        return jsonify({'error': 'Failed to remove all images from TV'}), 500

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
    # Use DEBUG env variable ("1", "true", "True" = True)
    debug_env = os.environ.get('DEBUG', '').lower()
    debug = debug_env in ('1', 'true', 'yes')
    app.run(debug=debug, host="0.0.0.0")
