from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.user import User
from app import profile_fields

profile_bp = Blueprint('profile', __name__)


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


@profile_bp.route('', methods=['GET'])
@jwt_required()
def get_profile():
    user = _current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'fields': profile_fields.public_schema(), 'values': profile_fields.get_values(user)}), 200


@profile_bp.route('', methods=['PUT'])
@jwt_required()
def update_profile():
    user = _current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    cleaned, errors = profile_fields.validate(request.get_json(silent=True))
    new_email = cleaned.get('email')
    if new_email and new_email != user.email and User.query.filter_by(email=new_email).first():
        errors['email'] = 'Email already in use'
    if errors:
        return jsonify({'error': 'Invalid profile values', 'errors': errors}), 400

    profile_fields.apply(user, cleaned)
    db.session.commit()
    return jsonify({'fields': profile_fields.public_schema(), 'values': profile_fields.get_values(user)}), 200
