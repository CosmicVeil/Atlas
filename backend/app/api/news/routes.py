from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models.portfolio import Portfolio
from services.warning_store import get_market_warnings, get_portfolio_warnings


news_bp = Blueprint('news', __name__)


@news_bp.route('/warnings', methods=['GET'])
def get_warning_feed():
    """
    Read-only endpoint for AI-accepted market warnings.

    This endpoint is intentionally separate from portfolios and holdings. The
    news/warning streamer writes to MongoDB, and the website reads from MongoDB
    here without changing any user portfolio data.
    """
    try:
        limit = int(request.args.get('limit', 50))
    except ValueError:
        limit = 50

    limit = max(1, min(limit, 100))

    try:
        warnings = get_market_warnings(limit=limit)
    except Exception as exc:
        print(f"[news-warnings] Warning lookup failed: {exc}")
        warnings = {'negative': [], 'positive': []}

    return jsonify({
        'negative': warnings['negative'],
        'positive': warnings['positive'],
    }), 200


@news_bp.route('/portfolio-warnings/<int:portfolio_id>', methods=['GET'])
@jwt_required()
def get_portfolio_warning_feed(portfolio_id):
    """
    Return the warning feed exactly one Portfolio detail page needs.

    Negative warnings are filtered to stocks in this specific portfolio.
    Positive warnings are intentionally market-wide, so the user can see
    opportunities even if they do not already hold that stock.
    """
    user_id = get_jwt_identity()

    try:
        limit = int(request.args.get('limit', 50))
    except ValueError:
        limit = 50

    limit = max(1, min(limit, 100))

    try:
        portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
        if not portfolio:
            return jsonify({'error': 'Portfolio not found'}), 404

        owned_symbols = sorted({holding.symbol.upper() for holding in portfolio.holdings})
        warnings = get_portfolio_warnings(owned_symbols, limit=limit)
    except Exception as exc:
        print(f"[portfolio-warnings] Warning lookup failed: {exc}")
        warnings = {'negative': [], 'positive': []}

    return jsonify({
        'negative': warnings['negative'],
        'positive': warnings['positive'],
    }), 200
