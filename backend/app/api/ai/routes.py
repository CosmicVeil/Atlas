from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
import os
import json
import threading
import time
from datetime import datetime
from app.extensions import db
from app.models.portfolio import Portfolio
from app.models.holding import Holding
from app.models.Stock import Stock
from services import market_data
from services import ai_service

ai_bp = Blueprint('ai', __name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'ai_top_500.json')


def _get_portfolio_context(portfolio_id, user_id):
    """Helper to fetch portfolio and build context dictionary with holdings and statistics."""
    portfolio = Portfolio.query.filter_by(id=portfolio_id, user_id=user_id).first()
    if not portfolio:
        return None

    holdings_data = []
    total_invested = 0
    total_value = 0

    for holding in portfolio.holdings:
        quote = market_data.get_quote(holding.symbol)
        current_price = quote['price'] if quote else holding.buy_price
        
        h_dict = holding.to_dict_with_live_data(current_price)
        holdings_data.append(h_dict)
        
        total_invested += h_dict['amount_invested']
        total_value += h_dict['current_value']

    total_gain_loss = total_value - total_invested
    total_gain_loss_pct = ((total_value - total_invested) / total_invested * 100) if total_invested > 0 else 0

    return {
        'portfolio_id': portfolio.id,
        'portfolio_name': portfolio.name,
        'holdings': holdings_data,
        'summary': {
            'total_invested': round(total_invested, 2),
            'total_value': round(total_value, 2),
            'total_gain_loss': round(total_gain_loss, 2),
            'total_gain_loss_pct': round(total_gain_loss_pct, 2)
        }
    }


@ai_bp.route('/analyze', methods=['POST'])
@jwt_required()
def analyze():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    symbol = data.get('symbol')
    portfolio_id = data.get('portfolio_id')

    if not symbol:
        return jsonify({'error': 'Stock symbol is required'}), 400

    symbol = symbol.strip().upper()
    
    # 1. Fetch stock fundamentals and price
    stock = Stock.query.filter_by(symbol=symbol).first()
    if not stock:
        # Try fetching from API directly
        overview = market_data.get_company_overview(symbol)
        quote = market_data.get_quote(symbol)
        if not overview or not quote:
            return jsonify({'error': f'Stock symbol {symbol} not found'}), 404
        
        stock_info = overview | quote
    else:
        # Use our database record
        quote = market_data.get_quote(symbol)
        stock_info = stock.to_dict()
        if quote:
            stock_info.update(quote)

    # 2. Get portfolio personalization context if provided
    portfolio_context = None
    if portfolio_id:
        portfolio_context = _get_portfolio_context(portfolio_id, user_id)

    # 3. Analyze stock
    analysis = ai_service.analyze_stock(stock_info, portfolio_context)
    return jsonify(analysis), 200


@ai_bp.route('/portfolio-recommend', methods=['POST'])
@jwt_required()
def recommend():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    portfolio_id = data.get('portfolio_id')

    if not portfolio_id:
        return jsonify({'error': 'Portfolio ID is required'}), 400

    portfolio_context = _get_portfolio_context(portfolio_id, user_id)
    if not portfolio_context:
        return jsonify({'error': 'Portfolio not found'}), 404

    recommendations = ai_service.recommend_portfolio(portfolio_context)
    return jsonify(recommendations), 200


@ai_bp.route('/budget-suggest', methods=['POST'])
@jwt_required()
def budget_suggest():
    user_id = get_jwt_identity()
    data = request.get_json() or {}
    budget = data.get('budget')
    portfolio_id = data.get('portfolio_id')

    if budget is None:
        return jsonify({'error': 'Budget is required'}), 400

    try:
        budget = float(budget)
    except ValueError:
        return jsonify({'error': 'Budget must be a number'}), 400

    # Get portfolio context
    portfolio_context = None
    if portfolio_id:
        portfolio_context = _get_portfolio_context(portfolio_id, user_id)

    # Fetch top stocks to pick from (by volume and market cap)
    available_stocks_objs = Stock.query.order_by(Stock.market_cap.desc()).limit(30).all()
    available_stocks = [s.to_dict() for s in available_stocks_objs]

    suggestions = ai_service.suggest_buys(budget, portfolio_context, available_stocks)
    return jsonify(suggestions), 200


def _update_with_live_quotes(cached_data):
    """Fetches real-time prices for recommended/avoid stocks in parallel to ensure live data."""
    from concurrent.futures import ThreadPoolExecutor
    
    recommended = cached_data.get('recommended', [])
    worst = cached_data.get('worst', [])
    all_stocks = recommended + worst

    def get_and_update(stock):
        try:
            quote = market_data.get_quote(stock['ticker'])
            if quote:
                stock['price'] = quote['price']
                stock['change'] = quote['change']
                pct_str = quote['change_percent'].replace('%', '')
                try:
                    stock['changePercent'] = float(pct_str)
                except ValueError:
                    stock['changePercent'] = 0.0
                
                # Update potentialReturn based on the new live price if targetPrice is available
                # potentialReturn = targetPrice_gain_pct
                if 'targetPrice' in stock and stock['targetPrice'] and stock['price']:
                    try:
                        target = float(stock['targetPrice'])
                        price = float(stock['price'])
                        stock['potentialReturn'] = round((target - price) / price * 100, 1)
                    except (ValueError, TypeError):
                        pass
        except Exception as e:
            print(f"Error updating live price for {stock['ticker']}: {e}")

    with ThreadPoolExecutor(max_workers=10) as executor:
        list(executor.map(get_and_update, all_stocks))


@ai_bp.route('/top-500', methods=['GET'])
@jwt_required()
def get_top_500():
    """Returns top 500 stocks analysis (best and worst stocks to avoid)."""
    cached_data = None
    needs_rebuild = False

    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                cached_data = json.load(f)
            
            # Check if cache is older than 24 hours OR if any stock has been updated since then
            last_updated_str = cached_data.get('lastUpdated')
            if last_updated_str:
                last_updated = datetime.fromisoformat(last_updated_str)
                if (datetime.utcnow() - last_updated).total_seconds() > 86400:
                    needs_rebuild = True
                else:
                    newest_stock = Stock.query.order_by(Stock.last_updated.desc()).first()
                    if newest_stock and newest_stock.last_updated:
                        if newest_stock.last_updated > last_updated:
                            print(f"[CACHE] DB has newer updates ({newest_stock.last_updated} > {last_updated}). Rebuilding cache...")
                            needs_rebuild = True
        except Exception as e:
            print(f"Error reading S&P 500 AI cache: {e}")
            needs_rebuild = True

    if not cached_data:
        # No cache exists at all; generate it synchronously
        cached_data = _generate_and_cache_top_500()
    elif needs_rebuild:
        # Cache is stale; rebuild in the background
        print("[CACHE] Cache is stale. Rebuilding in background thread...")
        from flask import current_app
        app = current_app._get_current_object()
        
        def run_in_context():
            with app.app_context():
                try:
                    _generate_and_cache_top_500()
                except Exception as e:
                    print(f"Error rebuilding cache in background: {e}")
        
        threading.Thread(target=run_in_context).start()

    # Update with live quotes on every request so prices are always fresh
    _update_with_live_quotes(cached_data)
    return jsonify(cached_data), 200


@ai_bp.route('/top-500/refresh', methods=['POST'])
@jwt_required()
def refresh_top_500():
    """Regenerates the cached top 500 analysis and returns it."""
    data = _generate_and_cache_top_500()
    _update_with_live_quotes(data)
    return jsonify(data), 200



def _generate_and_cache_top_500():
    """Internal helper to generate AI recommendations for top 500 stocks and cache it."""
    # List of top recommended and avoid stock tickers we will analyze/simulate
    rec_tickers = ["NVDA", "MSFT", "AMD", "GOOGL", "AAPL", "AMZN", "META", "AVGO", "COST", "LLY"]
    avoid_tickers = ["SNAP", "RIVN", "COIN", "ZM", "HOOD", "NKLA", "PTON", "WBA", "INTC", "DIS"]

    existing_analyses = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                old_cache = json.load(f)
                for item in old_cache.get('recommended', []) + old_cache.get('worst', []):
                    existing_analyses[item['ticker']] = item
        except Exception as e:
            print(f"Error loading existing cache for fallback: {e}")

    recommended = []
    worst = []

    # Get data from database for recommended
    for ticker in rec_tickers:
        stock = Stock.query.filter_by(symbol=ticker).first()
        if stock:
            quote = market_data.get_quote(ticker) or {}
            stock_info = stock.to_dict()
            stock_info.update(quote)
            
            # Use database AI analysis if it exists, otherwise check existing cache, otherwise fall back to direct query
            if stock.ai_recommendation:
                rec_val = stock.ai_recommendation
                confidence_val = stock.ai_confidence
                reasoning_val = stock.ai_summary
                pros_val = json.loads(stock.ai_pros) if stock.ai_pros else []
                potential_val = round(float(stock.ai_target_price - stock.price) / stock.price * 100, 1) if stock.price else 0.0
            elif ticker in existing_analyses:
                exist_item = existing_analyses[ticker]
                rec_val = exist_item.get('recommendation', 'hold')
                confidence_val = exist_item.get('confidence', 50)
                reasoning_val = exist_item.get('reasoning', '')
                pros_val = exist_item.get('keyPoints', [])
                potential_val = exist_item.get('potentialReturn', 0.0)
            else:
                analysis = ai_service.analyze_stock(stock_info)
                rec_val = 'strong_buy' if ticker in ["NVDA", "MSFT"] else 'buy'
                confidence_val = analysis.get('confidence', 85)
                reasoning_val = analysis.get('summary', '')
                pros_val = analysis.get('pros', [])[:4]
                potential_val = round(float(analysis.get('targetPrice', stock.price) - stock.price) / stock.price * 100, 1) if stock.price else 0.0

            recommended.append({
                'ticker': ticker,
                'name': stock.name,
                'price': stock_info.get('price', stock.price),
                'change': stock_info.get('change', stock.change),
                'changePercent': float(stock_info.get('change_percent', '0%').replace('%', '')),
                'recommendation': rec_val,
                'confidence': confidence_val,
                'reasoning': reasoning_val,
                'keyPoints': pros_val,
                'riskLevel': 'medium' if ticker in ["NVDA", "AMD"] else 'low',
                'potentialReturn': potential_val
            })

    # Get data for avoid
    for ticker in avoid_tickers:
        stock = Stock.query.filter_by(symbol=ticker).first()
        if stock:
            quote = market_data.get_quote(ticker) or {}
            stock_info = stock.to_dict()
            stock_info.update(quote)
            
            if stock.ai_recommendation:
                rec_val = stock.ai_recommendation
                confidence_val = stock.ai_confidence
                reasoning_val = stock.ai_summary
                cons_val = json.loads(stock.ai_cons) if stock.ai_cons else []
                potential_val = round(float(stock.ai_target_price - stock.price) / stock.price * 100, 1) if stock.price else 0.0
            elif ticker in existing_analyses:
                exist_item = existing_analyses[ticker]
                rec_val = exist_item.get('recommendation', 'hold')
                confidence_val = exist_item.get('confidence', 50)
                reasoning_val = exist_item.get('reasoning', '')
                cons_val = exist_item.get('keyPoints', [])
                potential_val = exist_item.get('potentialReturn', 0.0)
            else:
                analysis = ai_service.analyze_stock(stock_info)
                rec_val = 'strong_sell' if ticker in ["RIVN", "HOOD"] else 'sell'
                confidence_val = analysis.get('confidence', 80)
                reasoning_val = analysis.get('summary', '')
                cons_val = analysis.get('cons', [])[:4]
                potential_val = round(float(analysis.get('targetPrice', stock.price) - stock.price) / stock.price * 100, 1) if stock.price else 0.0

            worst.append({
                'ticker': ticker,
                'name': stock.name,
                'price': stock_info.get('price', stock.price),
                'change': stock_info.get('change', stock.change),
                'changePercent': float(stock_info.get('change_percent', '0%').replace('%', '')),
                'recommendation': rec_val,
                'confidence': confidence_val,
                'reasoning': reasoning_val,
                'keyPoints': cons_val,
                'riskLevel': 'high',
                'potentialReturn': potential_val
            })

    # If database is empty or we couldn't seed, return standard mock items
    if not recommended:
        recommended = [
            {
                "ticker": "NVDA",
                "name": "NVIDIA Corporation",
                "price": 892.45,
                "change": 12.34,
                "changePercent": 1.4,
                "recommendation": "strong_buy",
                "confidence": 92,
                "reasoning": "Strong AI/GPU market leadership with expanding data center business. Recent earnings beat expectations by 15%, and forward guidance suggests continued growth in H100/H200 chip demand.",
                "keyPoints": [
                    "Market leader in AI chip technology",
                    "Data center revenue up 217% YoY",
                    "Strong partnership ecosystem",
                    "Healthy profit margins above 70%"
                ],
                "riskLevel": "medium",
                "potentialReturn": 35.2
            },
            {
                "ticker": "MSFT",
                "name": "Microsoft Corporation",
                "price": 425.80,
                "change": 8.20,
                "changePercent": 2.0,
                "recommendation": "strong_buy",
                "confidence": 89,
                "reasoning": "Azure cloud growth accelerating with AI integration. Office 365 Copilot adoption exceeding expectations, creating new revenue streams. Strong balance sheet provides stability.",
                "keyPoints": [
                    "Azure cloud revenue up 29% YoY",
                    "AI Copilot driving subscription growth",
                    "Diversified revenue streams",
                    "Strong free cash flow generation"
                ],
                "riskLevel": "low",
                "potentialReturn": 28.5
            }
        ]
        
        worst = [
            {
                "ticker": "SNAP",
                "name": "Snap Inc.",
                "price": 12.34,
                "change": -0.89,
                "changePercent": -6.7,
                "recommendation": "sell",
                "confidence": 84,
                "reasoning": "Continued user growth challenges in competitive social media landscape. Ad revenue declining as major advertisers shift budgets. AR strategy not gaining traction fast enough.",
                "keyPoints": [
                    "Daily active users declining",
                    "Ad revenue down 12% YoY",
                    "Increasing competition from TikTok/Instagram",
                    "High operating costs relative to revenue"
                ],
                "riskLevel": "high",
                "potentialReturn": -25.4
            }
        ]

    cache_data = {
        'recommended': recommended,
        'worst': worst,
        'lastUpdated': datetime.now().isoformat()
    }

    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, indent=2)
    except Exception as e:
        print(f"Error caching top 500 AI analysis: {e}")

    return cache_data


# Global state for background analysis task
analysis_lock = threading.Lock()
analysis_progress = {
    "is_running": False,
    "current": 0,
    "total": 0,
    "current_ticker": "",
    "error_count": 0,
    "status": "idle" # idle, running, stopped, completed, error
}


def run_batch_analysis(app_context):
    global analysis_progress
    log_file = r"c:\Users\varun\Desktop\Atlas-main\backend\batch_debug.log"
    with open(log_file, "w") as lf:
        lf.write("Thread started\n")
        lf.flush()
        with app_context:
            try:
                lf.write("App context entered. Querying stocks...\n")
                lf.flush()
                stocks = Stock.query.all()
                lf.write(f"Query succeeded. Total stocks: {len(stocks)}\n")
                lf.flush()
                analysis_progress["total"] = len(stocks)
                analysis_progress["current"] = 0
                analysis_progress["error_count"] = 0
                analysis_progress["status"] = "running"
                
                for stock in stocks:
                    if not analysis_progress["is_running"]:
                        analysis_progress["status"] = "stopped"
                        lf.write("Stop requested, exiting loop\n")
                        lf.flush()
                        break
                        
                    analysis_progress["current_ticker"] = stock.symbol
                    lf.write(f"Analyzing {stock.symbol}...\n")
                    lf.flush()
                    
                    try:
                        stock_info = stock.to_dict()
                        analysis = ai_service.analyze_stock(stock_info)
                        
                        if analysis and not analysis.get("error"):
                            stock.ai_recommendation = analysis.get("recommendation", "hold")
                            stock.ai_confidence = int(analysis.get("confidence", 50))
                            stock.ai_summary = analysis.get("summary", "")
                            stock.ai_pros = json.dumps(analysis.get("pros", []))
                            stock.ai_cons = json.dumps(analysis.get("cons", []))
                            stock.ai_risk_factors = json.dumps(analysis.get("riskFactors", []))
                            stock.ai_target_price = float(analysis.get("targetPrice", stock.price))
                            stock.ai_prediction = analysis.get("prediction", "neutral")
                            stock.last_updated = datetime.utcnow()
                            db.session.commit()
                            lf.write(f"Successfully analyzed & committed {stock.symbol}\n")
                            lf.flush()
                        else:
                            analysis_progress["error_count"] += 1
                            lf.write(f"AI service returned empty analysis for {stock.symbol}\n")
                            lf.flush()
                    except Exception as e:
                        db.session.rollback()
                        analysis_progress["error_count"] += 1
                        lf.write(f"Error analyzing {stock.symbol}: {e}\n")
                        lf.flush()
                        
                    analysis_progress["current"] += 1
                    time.sleep(1.5)
                    
                if analysis_progress["status"] == "running":
                    analysis_progress["status"] = "completed"
                    lf.write("Completed successfully\n")
                    lf.flush()
            except Exception as e:
                analysis_progress["status"] = "error"
                lf.write(f"Fatal error in batch thread: {e}\n")
                lf.flush()
            finally:
                analysis_progress["is_running"] = False


@ai_bp.route('/analyze-all/start', methods=['POST'])
@jwt_required()
def start_analyze_all():
    global analysis_progress
    from flask import current_app
    
    with analysis_lock:
        if analysis_progress["is_running"]:
            return jsonify({"message": "Analysis is already running", "status": analysis_progress}), 400
            
        analysis_progress["is_running"] = True
        analysis_progress["status"] = "running"
        analysis_progress["current"] = 0
        analysis_progress["error_count"] = 0
        analysis_progress["current_ticker"] = ""
        
        app_context = current_app._get_current_object().app_context()
        thread = threading.Thread(target=run_batch_analysis, args=(app_context,))
        thread.daemon = True
        thread.start()
        
        return jsonify({"message": "Started batch analysis", "status": analysis_progress}), 200


@ai_bp.route('/analyze-all/stop', methods=['POST'])
@jwt_required()
def stop_analyze_all():
    global analysis_progress
    with analysis_lock:
        if not analysis_progress["is_running"]:
            return jsonify({"message": "Analysis is not running", "status": analysis_progress}), 400
            
        analysis_progress["is_running"] = False
        analysis_progress["status"] = "stopped"
        return jsonify({"message": "Stopping batch analysis", "status": analysis_progress}), 200


@ai_bp.route('/analyze-all/status', methods=['GET'])
@jwt_required()
def get_analyze_all_status():
    global analysis_progress
    return jsonify(analysis_progress), 200

