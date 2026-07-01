from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.extensions import db
from app.models.portfolio import Portfolio

portfolio_bp = Blueprint('portfolio', __name__)

@portfolio_bp.route('/', methods=['POST'])
@jwt_required()
def create_portfolio():
    user_id = get_jwt_identity()
    data = request.get_json()
    name = data.get('name')

    if not name:
        return jsonify({'error': 'Name is required'}), 400

    portfolio = Portfolio(name=name, user_id=user_id)
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
    
    from services import market_data
    result = []
    for p in portfolios:
        p_dict = p.to_dict()
        total_invested = 0
        total_value = 0
        for holding in p.holdings:
            quote = market_data.get_quote(holding.symbol)
            current_price = quote['price'] if quote else holding.buy_price
            total_invested += holding.shares * holding.buy_price
            total_value += holding.shares * current_price
            
        p_dict['holdings_count'] = len(p.holdings)
        p_dict['total_invested'] = round(total_invested, 2)
        p_dict['total_value'] = round(total_value, 2)
        p_dict['total_gain_loss'] = round(total_value - total_invested, 2)
        p_dict['total_gain_loss_pct'] = round(((total_value - total_invested) / total_invested * 100), 2) if total_invested > 0 else 0.0
        
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


