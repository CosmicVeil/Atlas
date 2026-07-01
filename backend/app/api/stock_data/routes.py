from flask import Blueprint, jsonify, request
from app.models.Stock import Stock
from sqlalchemy import or_
from services import market_data

stocks_bp = Blueprint('stocks', __name__)


@stocks_bp.route('/stocks', methods=['GET'])
def get_stocks():
    # 1. Get Query Parameters for Search & Filter
    search_query = request.args.get('search', '').strip()
    sector_filter = request.args.get('sector')
    industry_filter = request.args.get('industry')
    
    # 2. Get Query Parameters for Sorting
    sort_by = request.args.get('sort_by', 'symbol')  # Default sort by symbol
    order = request.args.get('order', 'asc')        # Default ascending
    
    # 3. Pagination (Crucial for large tabular data)
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 25, type=int)
 
    # Start building the base query
    query = Stock.query
 
    if search_query:
        query = query.filter(or_(
            Stock.symbol.ilike(f'%{search_query}%'),
            Stock.name.ilike(f'%{search_query}%')
        ))
 
    if sector_filter:
        query = query.filter(Stock.sector.ilike(sector_filter))
 
    if industry_filter:
        query = query.filter(Stock.industry.ilike(industry_filter))

    sort_columns = {
        'symbol': Stock.symbol,
        'name': Stock.name,
        'sector': Stock.sector,
        'industry': Stock.industry,
        'market_cap': Stock.market_cap,
        'pe_ratio': Stock.pe_ratio,
        'price': Stock.price,
        'change': Stock.change,
        'change_percent': Stock.change_percent,
        'volume': Stock.volume,
        'ai_recommendation': Stock.ai_recommendation,
        'ai_confidence': Stock.ai_confidence,
        'ai_prediction': Stock.ai_prediction,
        'ai_target_price': Stock.ai_target_price
    }
    
    column_to_sort = sort_columns.get(sort_by) or Stock.symbol
    if order == 'desc':
        query = query.order_by(column_to_sort.desc())
    else:
        query = query.order_by(column_to_sort.asc())

    # Execute with Pagination
    paginated_stocks = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'stocks': [stock.to_dict(include_description=False) for stock in paginated_stocks.items],
        'total_pages': paginated_stocks.pages,
        'current_page': paginated_stocks.page,
        'total_items': paginated_stocks.total
    }), 200


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

