from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory
import os
import json
from werkzeug.utils import secure_filename
from pathlib import Path
import sys

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
)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}


# --- JSON data helper ---
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

def read_json_data(name):
    path = os.path.join(DATA_DIR, f'{name}.json')
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except Exception:
            return None

def write_json_data(name, value):
    path = os.path.join(DATA_DIR, f'{name}.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)

# Albums will be stored in a JSON file for persistence
ALBUMS_FILE = os.path.join(DATA_DIR, 'albums.json')

app = Flask(__name__, static_folder="frontend/build/client")
app.secret_key = 'frameartsecretkey'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(os.path.dirname(__file__), 'data'), exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_albums():
    return read_json_data('albums') or []

def save_albums(albums):
    write_json_data('albums', albums)
@app.route('/api/images', methods=['GET'])
def api_list_images():
    files = [f for f in os.listdir(app.config['UPLOAD_FOLDER']) if os.path.isfile(os.path.join(app.config['UPLOAD_FOLDER'], f))]
    return {'images': files}

# Album API
@app.route('/api/albums', methods=['GET'])
def api_list_albums():
    return {'albums': load_albums()}

@app.route('/api/albums', methods=['POST'])
def api_create_album():
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name:
        return {'error': 'Album name required'}, 400
    albums = load_albums()
    if any(a['name'] == name for a in albums):
        return {'error': 'Album already exists'}, 400
    albums.append({'name': name, 'images': []})
    save_albums(albums)
    return {'success': True, 'albums': albums}

@app.route('/api/albums/<album_name>/add', methods=['POST'])
def api_add_image_to_album(album_name):
    data = request.get_json()
    image = data.get('image')
    if not image:
        return {'error': 'Image required'}, 400
    albums = load_albums()
    for album in albums:
        if album['name'] == album_name:
            if image not in album['images']:
                album['images'].append(image)
            save_albums(albums)
            return {'success': True, 'albums': albums}
    return {'error': 'Album not found'}, 404

@app.route('/api/albums/<album_name>', methods=['DELETE'])
def api_delete_album(album_name):
    albums = load_albums()
    new_albums = [a for a in albums if a['name'] != album_name]
    if len(new_albums) == len(albums):
        return {'error': 'Album not found'}, 404
    save_albums(new_albums)
    return {'success': True, 'albums': new_albums}





@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        flash('No file part')
        return redirect(url_for('index'))
    file = request.files['file']
    if file.filename == '':
        flash('No selected file')
        return redirect(url_for('index'))
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
        flash('File uploaded successfully')
    else:
        flash('Invalid file type')
    return redirect(url_for('index'))

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# --- TV API endpoints ---
from flask import jsonify

# TV management endpoints
@app.route('/api/tvs', methods=['GET'])
def api_get_tvs():
    tvs = read_json_data('tvs')
    return {'tvs': tvs or []}

@app.route('/api/tvs', methods=['POST'])
def api_add_tv():
    data = request.get_json()
    if not data or not data.get('ip'):
        return {'error': 'TV IP required'}, 400
    tvs = read_json_data('tvs') or []
    # Avoid duplicates by IP
    if any(tv.get('ip') == data['ip'] for tv in tvs):
        return {'error': 'TV already exists'}, 400
    tvs.append(data)
    write_json_data('tvs', tvs)
    return {'success': True, 'tvs': tvs}

@app.route('/api/tv/send', methods=['POST'])
def api_send_to_tv():
    data = request.get_json()
    ip = data.get('ip')
    filename = data.get('filename')
    brightness = data.get('brightness')
    display = data.get('display', True)
    if not ip or not filename:
        return {'error': 'TV IP and filename required'}, 400
    try:
        art_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        upload_artwork(ip, art_path, brightness=brightness, display=display)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/on', methods=['POST'])
def api_tv_power_on(ip):
    data = request.get_json(silent=True) or {}
    mac = data.get('mac')
    try:
        power_on(ip, mac)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/off', methods=['POST'])
def api_tv_power_off(ip):
    try:
        power_off(ip)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/artmode', methods=['POST'])
def api_tv_art_mode(ip):
    try:
        enable_art_mode(ip)
        return {'success': True}
    except FrameTVError as e:
        return {'error': str(e)}, 500

@app.route('/api/tv/<ip>/status', methods=['GET'])
def api_tv_status(ip):
    try:
        art_mode = is_art_mode_on(ip)
        screen_on = is_tv_reachable(ip)
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
    app.run(debug=True)
