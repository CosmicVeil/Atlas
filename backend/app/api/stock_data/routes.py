from flask import Blueprint, request, jsonify
from app.models.stock import Stock  # Assuming you have a Stock model
from sqlalchemy import or_

stocks_bp = Blueprint('stocks', __name__)

@stock_bp.route('/stocks', methods=['GET'])
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
        query = query.filter(or_(Stock.symbol.ilike(f'%{search_query}%'),
                Stock.name.ilike(f'%{search_query}%')
            )
        )

    if sector_filter:
        query = query.filter(Stock.sector.ilike(sector_filter))

    if industry_filter:
        query = query.filter(Stock.sector.ilike(industry_filter))

    sort_columns = {
        'symbol': Stock.symbol,
        'name': Stock.name,
        'market_cap': Stock.market_cap,
        'pe_ratio': Stock.pe_ratio,
        'price': Stock.price,
        'change_percent': Stock.change_percent,
        'volume': Stock.volume
    }
    
    column_to_sort = sort_columns.get(sort_by, Stock.symbol)
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
    stock = Stock.query.filter_by(symbol=symbol.upper()).first()
    if not stock:
        return jsonify({'error': 'Stock not found'}), 404
        
    # Returns everything, including the description
    return jsonify(stock.to_dict(include_description=True)), 200