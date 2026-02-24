from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory, jsonify
import os
from werkzeug.utils import secure_filename
from pathlib import Path
import sys
from flask_sqlalchemy import SQLAlchemy
from utils.frame_tv import SamsungTVWS, FrameTVError, DEFAULT_PORT
from samsungtvws.exceptions import HttpApiError, ResponseError
from const import CONNECTION_NAME
from datetime import datetime
from flask_migrate import Migrate
import importlib
# Load environment variables from .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# --- Media Provider Integration ---
MEDIA_PROVIDER = os.environ.get("MEDIA_PROVIDER", "local")  # "immich" or "local"
IMMICH_API_KEY = os.environ.get("IMMICH_API_KEY")
IMMICH_HOST = os.environ.get("IMMICH_HOST")
IMMICH_PORT = int(os.environ.get("IMMICH_PORT", 443))

media_provider = None
print("media provider", MEDIA_PROVIDER)
if MEDIA_PROVIDER == "immich" and IMMICH_API_KEY and IMMICH_HOST:
    try:
        ImmichProvider = importlib.import_module("utils.immich_provider").ImmichProvider
        media_provider = ImmichProvider(IMMICH_API_KEY, IMMICH_HOST, IMMICH_PORT)
    except Exception as e:
        print(f"Failed to initialize Immich provider: {e}")
else:
    media_provider = None

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

print("instanc efolder", INSTANCE_FOLDER)

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(INSTANCE_FOLDER, exist_ok=True)

frametv_db_path = os.path.abspath(os.path.join(INSTANCE_FOLDER, 'frametv.db'))

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}

app = Flask(__name__, static_folder="frontend/build/client")
app.secret_key = os.environ.get('SECRET_KEY', 'frameartsecretkey')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{frametv_db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- Models ---
class Album(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    images = db.relationship('Image', backref='album', lazy=True, cascade="all, delete-orphan")

class Image(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    album_id = db.Column(db.Integer, db.ForeignKey('album.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

class TV(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(64), unique=True, nullable=False)
    name = db.Column(db.String(80), nullable=True)
    mac = db.Column(db.String(32), nullable=True)
    token = db.Column(db.Text, nullable=True)  # Store the TV token as text
    delete_other_images_on_upload = db.Column(db.Boolean, nullable=False, server_default=db.text("0"))

# New table to track uploaded images per TV
class UploadedImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    image_id = db.Column(db.Integer, db.ForeignKey('image.id'), nullable=False)
    tv_id = db.Column(db.Integer, db.ForeignKey('tv.id'), nullable=False)
    content_id = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    image = db.relationship('Image', backref='uploaded_images')
    tv = db.relationship('TV', backref='uploaded_images')

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


# Album API
@app.route('/api/albums', methods=['GET'])
def api_list_albums():
    albums = Album.query.all()
    result = []
    for album in albums:
        result.append({
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
    image = data.get('image')
    if not image:
        return {'error': 'Image required'}, 400
    album = Album.query.filter_by(name=album_name).first()
    if not album:
        return {'error': 'Album not found'}, 404
    # Only add if not already present
    if not any(img.filename == image for img in album.images):
        img = Image(filename=image, album=album)
        db.session.add(img)
        db.session.commit()
    return api_list_albums()

@app.route('/api/albums/<album_name>', methods=['DELETE'])
def api_delete_album(album_name):
    album = Album.query.filter_by(name=album_name).first()
    if not album:
        return {'error': 'Album not found'}, 404
    db.session.delete(album)
    db.session.commit()
    return api_list_albums()



@app.route('/upload', methods=['POST'])
def upload():
    """ Upload image to the gallery """
    if 'file' not in request.files:
        return {'error': 'No file part'}, 400
    file = request.files['file']
    if file.filename == '':
        return {'error': 'No selected file'}, 400
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
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
        return {'error': str(e)}, 500


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)



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
        return {'error': f'Failed to connect to TV: {e}'}, 500
    except Exception as e:
        return {'error': f'Unexpected error: {e}'}, 500
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
    if not ip or not filename:
        return {'error': 'TV IP and filename required'}, 400
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        art_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
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
        return jsonify({'error': str(e)}), 500
    except (ResponseError) as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print("Unexpected error:", e)
        return jsonify({'error': 'Unexpected error', 'details': str(e)}), 500
    
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
        return jsonify({'error': 'Failed to remove all images from TV', 'details': str(e)}), 500

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
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/off', methods=['POST'])
def api_tv_power_off(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        power_off(ip, token=token)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/artmode', methods=['POST'])
def api_tv_art_mode(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        enable_art_mode(ip, token=token)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/status', methods=['GET'])
def api_tv_status(ip):
    tv = TV.query.filter_by(ip=ip).first()
    token = tv.token if tv else None
    try:
        art_mode = is_art_mode_on(ip, token=token)
        screen_on = is_tv_reachable(ip, token=token)
        return {'art_mode': art_mode, 'screen_on': screen_on}
    except FrameTVError as e:
        return {'error': str(e)}, 500

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
        return {'error': str(e)}, 500
    

# --- API Endpoints ---

# --- Immich/Media Provider Endpoints ---
import asyncio

@app.route('/api/provider/albums', methods=['GET'])
def api_provider_albums():
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    albums = loop.run_until_complete(media_provider.get_albums())
    loop.close()
    return jsonify({"albums": albums})

@app.route('/api/provider/albums/<album_id>/images', methods=['GET'])
def api_provider_album_images(album_id):
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    images = loop.run_until_complete(media_provider.get_album_images(album_id))
    loop.close()
    return jsonify({"images": images})

@app.route('/api/provider/images/<image_id>/stream', methods=['GET'])
def api_provider_stream_image(image_id):
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    size = request.args.get("size", "fullsize")
    # Simple in-memory cache
    if not hasattr(app, "_provider_image_cache"):
        app._provider_image_cache = {}
    cache_key = f"{image_id}:{size}"
    if cache_key in app._provider_image_cache:
        image_bytes = app._provider_image_cache[cache_key]
    else:
        loop = asyncio.new_event_loop()
        image_bytes = loop.run_until_complete(media_provider.stream_image(image_id=image_id, size=size))
        loop.close()
        if image_bytes:
            app._provider_image_cache[cache_key] = image_bytes
    if not image_bytes:
        return jsonify({"error": "Image not found"}), 404
    from flask import Response
    return Response(image_bytes, mimetype="image/jpeg")

@app.route('/api/provider/images/<image_id>/metadata', methods=['GET'])
def api_provider_image_metadata(image_id):
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    metadata = loop.run_until_complete(media_provider.get_image_metadata(image_id))
    loop.close()
    return jsonify({"metadata": metadata})


    
# Place at the bottom for lowest priority 
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_file_path = os.path.join(app.static_folder, path)
    if os.path.isfile(static_file_path):
        return send_from_directory(app.static_folder, path)
    # Always serve index.html for any unknown route (client-side routing)
    return send_from_directory(app.static_folder, 'index.html')


if __name__ == '__main__':
    # Use DEBUG env variable ("1", "true", "True" = True)
    debug_env = os.environ.get('DEBUG', '').lower()
    debug = debug_env in ('1', 'true', 'yes')
    app.run(debug=debug)
