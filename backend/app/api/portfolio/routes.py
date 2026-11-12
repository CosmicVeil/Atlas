from datetime import date
from math import isfinite

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.holding import Holding
from app.models.portfolio import Portfolio
from app.models.Stock import Stock

portfolio_bp = Blueprint('portfolio', __name__)

@portfolio_bp.route('/', methods=['POST'])
@jwt_required()
def create_portfolio():
    user_id = get_jwt_identity()
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid portfolio data'}), 400

    name = data.get('name')
    if not isinstance(name, str) or not name.strip():
        return jsonify({'error': 'Name is required'}), 400
    name = name.strip()
    if len(name) > 100:
        return jsonify({'error': 'Name must be 100 characters or fewer'}), 400

    initial_holdings = data.get('holdings', [])
    if not isinstance(initial_holdings, list):
        return jsonify({'error': 'Holdings must be a list'}), 400

    portfolio = Portfolio(name=name, user_id=user_id)
    symbols = set()
    saved_date = date.today()
    for item in initial_holdings:
        if not isinstance(item, dict) or not isinstance(item.get('symbol'), str):
            return jsonify({'error': 'Each holding needs a stock symbol'}), 400
        symbol = item['symbol'].strip().upper()
        try:
            shares = float(item.get('shares'))
            price = float(item.get('buy_price'))
        except (TypeError, ValueError, OverflowError):
            return jsonify({'error': 'Each holding needs a valid share quantity and price'}), 400

        cost = shares * price
        if shares <= 0 or price <= 0 or not isfinite(cost) or cost == 0:
            return jsonify({'error': 'Share quantities and prices must be positive and finite'}), 400
        symbols.add(symbol)
        portfolio.holdings.append(Holding(symbol=symbol, shares=shares, buy_price=price, date_bought=saved_date))

    if symbols:
        stock_rows = db.session.query(Stock.symbol).filter(Stock.symbol.in_(symbols))
        known_symbols = {symbol for (symbol,) in stock_rows}
        if symbols - known_symbols:
            return jsonify({'error': 'One or more holdings have an unknown stock symbol'}), 400

    db.session.add(portfolio)
    db.session.commit()
    return jsonify(portfolio.to_dict()), 201


@portfolio_bp.route('/<int:portfolio_id>', methods=['GET'])
@jwt_required()
def get_portfolio(portfolio_id):
    user_id = get_jwt_identity()
    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404
    return jsonify(portfolio.to_dict())


@portfolio_bp.route('/', methods=['GET'])
@jwt_required()
def get_portfolios():
    user_id = get_jwt_identity()
    portfolios = Portfolio.query.filter_by(user_id=user_id).all()

    result = []
    for p in portfolios:
        p_dict = p.to_dict()
        total_invested = 0
        for holding in p.holdings:
            total_invested += holding.shares * holding.buy_price

        # Keep this list endpoint fast. Live prices are fetched only after the
        # user opens one portfolio through the holdings endpoint.
        p_dict['holdings_count'] = len(p.holdings)
        p_dict['total_invested'] = round(total_invested, 2)

        result.append(p_dict)

    return jsonify(result)


@portfolio_bp.route('/<int:portfolio_id>', methods=['PUT'])
@jwt_required()
def update_portfolio(portfolio_id):
    user_id = get_jwt_identity()
    data = request.get_json()

    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404

    portfolio.name = data.get('name', portfolio.name)
    db.session.commit()
    return jsonify(portfolio.to_dict()), 200


@portfolio_bp.route('/<int:portfolio_id>', methods=['DELETE'])
@jwt_required()
def delete_portfolio(portfolio_id):
    user_id = get_jwt_identity()
    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404
    db.session.delete(portfolio)
    db.session.commit()
    return jsonify({'message': 'Portfolio deleted successfully'}), 200
