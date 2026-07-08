from flask import Blueprint, jsonify, request

from services.warning_store import get_market_warnings


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
