from flask import Blueprint, jsonify, request
from services import market_data

stocks_bp = Blueprint('stocks', __name__)


@stocks_bp.route('/stocks', methods=['GET'])
def get_all_stocks():
    """Return the entire CSV cache."""
    stocks = market_data.read_market_data()
    return jsonify({'stocks': stocks}), 200


@stocks_bp.route('/stocks/<string:symbol>', methods=['GET'])
def get_stock_detail(symbol):
    """
    Return data for a single ticker.
    Tries the CSV first; falls back to the live API if missing.
    """
    data = market_data.get_full_stock_info(symbol.upper())
    if not data:
        return jsonify({'error': 'Stock not found or API error'}), 404
    return jsonify(data), 200
