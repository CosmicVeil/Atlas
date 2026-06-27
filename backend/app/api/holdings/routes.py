from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from app.extensions import db
from app.models.holding import Holding
from app.models.portfolio import Portfolio
from services import market_data

holdings_bp = Blueprint('holdings', __name__)


# ADD a holding to a portfolio
@holdings_bp.route('/<int:portfolio_id>/holdings', methods=['POST'])
@jwt_required()
def add_holding(portfolio_id):
    user_id = get_jwt_identity()

    # make sure this portfolio belongs to the logged in user
    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404

    data = request.get_json()
    symbol = data.get('symbol')
    shares = data.get('shares')
    buy_price = data.get('buy_price')
    date_bought = data.get('date_bought')  # expects "YYYY-MM-DD"

    # basic validation
    if not all([symbol, shares, buy_price, date_bought]):
        return jsonify({'error': 'symbol, shares, buy_price and date_bought are all required'}), 400

    # check the symbol is real before saving
    quote = market_data.get_quote(symbol.upper())
    if not quote:
        return jsonify({'error': f'{symbol} is not a valid stock symbol'}), 400

    holding = Holding(
        portfolio_id=portfolio_id,
        symbol=symbol.upper(),
        shares=float(shares),
        buy_price=float(buy_price),
        date_bought=datetime.strptime(date_bought, '%Y-%m-%d').date()
    )
    db.session.add(holding)
    db.session.commit()

    return jsonify(holding.to_dict()), 201


# VIEW all holdings in a portfolio (with live prices)
@holdings_bp.route('/<int:portfolio_id>/holdings', methods=['GET'])
@jwt_required()
def get_holdings(portfolio_id):
    user_id = get_jwt_identity()

    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404

    result = []
    total_invested = 0
    total_value = 0

    for holding in portfolio.holdings:
        quote = market_data.get_quote(holding.symbol)
        current_price = quote['price'] if quote else holding.buy_price  # fall back to buy price if API fails

        holding_data = holding.to_dict_with_live_data(current_price)
        result.append(holding_data)

        total_invested += holding_data['amount_invested']
        total_value += holding_data['current_value']

    return jsonify({
        'portfolio_id': portfolio_id,
        'portfolio_name': portfolio.name,
        'holdings': result,
        # summary across the whole portfolio
        'summary': {
            'total_invested': round(total_invested, 2),
            'total_value': round(total_value, 2),
            'total_gain_loss': round(total_value - total_invested, 2),
            'total_gain_loss_pct': round(((total_value - total_invested) / total_invested) * 100, 2) if total_invested else 0,
        }
    })


# VIEW one holding
@holdings_bp.route('/<int:portfolio_id>/holdings/<int:holding_id>', methods=['GET'])
@jwt_required()
def get_holding(portfolio_id, holding_id):
    user_id = get_jwt_identity()

    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404

    holding = Holding.query.filter_by(id=holding_id, portfolio_id=portfolio_id).first()
    if not holding:
        return jsonify({'error': 'Holding not found'}), 404

    quote = market_data.get_quote(holding.symbol)
    current_price = quote['price'] if quote else holding.buy_price

    return jsonify(holding.to_dict_with_live_data(current_price))


# REMOVE a holding
@holdings_bp.route('/<int:portfolio_id>/holdings/<int:holding_id>', methods=['DELETE'])
@jwt_required()
def remove_holding(portfolio_id, holding_id):
    user_id = get_jwt_identity()

    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return jsonify({'error': 'Portfolio not found'}), 404

    holding = Holding.query.filter_by(id=holding_id, portfolio_id=portfolio_id).first()
    if not holding:
        return jsonify({'error': 'Holding not found'}), 404

    db.session.delete(holding)
    db.session.commit()

    return jsonify({'message': f'{holding.symbol} removed from portfolio'})