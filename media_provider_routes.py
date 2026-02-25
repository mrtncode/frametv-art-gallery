from flask import Blueprint, request, jsonify, current_app

media_provider_routes = Blueprint('media_provider', __name__)

# --- Immich/Media Provider Endpoints ---
import asyncio

def get_media_provider():
    return getattr(current_app, 'media_provider', None)

@media_provider_routes.route('/api/provider/albums', methods=['GET'])
def api_provider_albums():
    media_provider = get_media_provider()
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    albums = loop.run_until_complete(media_provider.get_albums())
    loop.close()
    return jsonify({"albums": albums})

@media_provider_routes.route('/api/provider/albums/<album_id>/images', methods=['GET'])
def api_provider_album_images(album_id):
    media_provider = get_media_provider()
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    images = loop.run_until_complete(media_provider.get_album_images(album_id))
    loop.close()
    return jsonify({"images": images})

@media_provider_routes.route('/api/provider/images/<image_id>/stream', methods=['GET'])
def api_provider_stream_image(image_id):
    media_provider = get_media_provider()
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    size = request.args.get("size", "fullsize")
    app = current_app
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

@media_provider_routes.route('/api/provider/images/<image_id>/metadata', methods=['GET'])
def api_provider_image_metadata(image_id):
    media_provider = get_media_provider()
    if not media_provider:
        return jsonify({"error": "No external provider configured"}), 404
    loop = asyncio.new_event_loop()
    metadata = loop.run_until_complete(media_provider.get_image_metadata(image_id))
    loop.close()
    return jsonify({"metadata": metadata})
