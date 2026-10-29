
from flask import Blueprint, request, jsonify, current_app

from models import ProviderConfig, db

provider_config_routes = Blueprint('provider_config', __name__)

# --- Provider Config API ---
@provider_config_routes.route('/api/providers', methods=['GET'])
def api_list_providers():
    configs = ProviderConfig.query.all()
    return {'providers': [c.as_dict() for c in configs]}

@provider_config_routes.route('/api/providers/<provider>', methods=['GET'])
def api_get_provider(provider):
    config = ProviderConfig.query.filter_by(provider=provider).first()
    if not config:
        return {'error': 'Provider not found'}, 404
    return config.as_dict()

@provider_config_routes.route('/api/providers/<provider>', methods=['POST', 'PUT'])
def api_set_provider(provider):
    data = request.get_json()
    config = ProviderConfig.query.filter_by(provider=provider).first()
    if not config:
        config = ProviderConfig(provider=provider)
        db.session.add(config)
    # Update fields
    config.host = data.get('host')
    config.port = data.get('port')
    config.api_key = data.get('api_key')
    config.enabled = bool(data.get('enabled', False))
    db.session.commit()
    return config.as_dict()

@provider_config_routes.route('/api/providers/<provider>', methods=['DELETE'])
def api_delete_provider(provider):
    config = ProviderConfig.query.filter_by(provider=provider).first()
    if not config:
        return {'error': 'Provider not found'}, 404
    db.session.delete(config)
    db.session.commit()
    return {'success': True}
