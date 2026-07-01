import csv
import os
import requests
import time
from datetime import date
import random

# ── Config ──
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CSV_PATH = os.path.join(DATA_DIR, 'stock_info.csv')

API_KEY = os.environ.get('ALPHA_VANTAGE_KEY') or os.environ.get('ALPHA_VANTAGE_API_KEY') or "demo"
BASE_URL = 'https://www.alphavantage.co/query'


def _load_cache():
    """Load all rows from the CSV cache into memory."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    if not os.path.exists(CSV_PATH):
        return []
    rows = []
    with open(CSV_PATH, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            row_dict = dict(row)
            for num_field in ['price', 'change', 'market_cap', 'pe_ratio', 'week_52_high', 'week_52_low', 'dividend_yield', 'eps', 'volume', 'previous_close']:
                if num_field in row_dict and row_dict[num_field]:
                    try:
                        if num_field in ['market_cap', 'volume']:
                            row_dict[num_field] = int(float(row_dict[num_field]))
                        else:
                            row_dict[num_field] = float(row_dict[num_field])
                    except ValueError:
                        pass
            rows.append(row_dict)
    return rows


def _get_cached_symbol(symbol):
    """Return cached row for a symbol (any date). None if not found."""
    cache = _load_cache()
    for row in cache:
        if row.get('symbol', '').upper() == symbol.upper():
            return row
    return None


def _save_to_cache(data):
    """Append a new row or overwrite existing one in the CSV cache."""
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    data['date'] = str(date.today())
    symbol = data.get('symbol', '').upper()
    cache = _load_cache()

    updated = False
    for row in cache:
        if row.get('symbol', '').upper() == symbol:
            row.update(data)
            updated = True
            break

    if not updated:
        cache.append(data)

    fieldnames = [
        'date', 'symbol', 'name', 'description', 'sector', 'industry',
        'market_cap', 'pe_ratio', 'week_52_high', 'week_52_low',
        'dividend_yield', 'eps', 'price', 'change', 'change_percent',
        'volume', 'previous_close'
    ]

    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        to_write = []
        for row in cache:
            cleaned = {}
            for k in fieldnames:
                cleaned[k] = row.get(k, '')
            to_write.append(cleaned)
            
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(to_write)


def getNamesOfStocks():
    """Return the list of S&P 500 tickers from constituents.csv."""
    file_path = os.path.join(DATA_DIR, 'constituents.csv')
    names = []
    if not os.path.exists(file_path):
        print(f"[WARN] constituents.csv not found at {file_path}")
        return names
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        try:
            next(reader)  # skip header
        except StopIteration:
            pass
        for row in reader:
            if row:
                names.append(row[0].strip().upper())
    return names


def seed_database_stocks():
    from app.extensions import db
    from app.models.Stock import Stock
    import random
    
    # Check if we already have stocks in the database
    if Stock.query.first():
        return
        
    print("Seeding database with S&P 500 stocks...")
    file_path = os.path.join(DATA_DIR, 'constituents.csv')
    if not os.path.exists(file_path):
        print(f"Constituents file not found at {file_path}")
        return
        
    with open(file_path, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        try:
            next(reader) # skip header
        except StopIteration:
            pass
        for row in reader:
            if not row or len(row) < 4:
                continue
            symbol = row[0].strip().upper()
            name = row[1].strip()
            sector = row[2].strip()
            industry = row[3].strip()
            cik = row[6].strip() if len(row) > 6 else ""
            
            # Generate realistic dummy stats
            price = round(random.uniform(10.0, 500.0), 2)
            change = round(random.uniform(-10.0, 10.0), 2)
            change_percent = f"{round((change / price) * 100, 2)}%"
            volume = random.randint(100000, 10000000)
            previous_close = round(price - change, 2)
            market_cap = random.randint(5_000_000_000, 2_000_000_000_000)
            pe_ratio = round(random.uniform(5.0, 50.0), 2)
            week_52_high = round(price * random.uniform(1.0, 1.3), 2)
            week_52_low = round(price * random.uniform(0.7, 1.0), 2)
            eps = round(price / pe_ratio, 2) if pe_ratio else round(random.uniform(0.5, 15.0), 2)
            dividend_yield = round(random.uniform(0.0, 5.0), 2)
            dividend_per_share = round(price * (dividend_yield / 100.0), 2)
            
            # Create description
            description = f"{name} is a leading company in the {industry} industry within the {sector} sector."
            
            stock = Stock(
                symbol=symbol,
                name=name,
                sector=sector,
                industry=industry,
                cik=cik,
                price=price,
                change=change,
                change_percent=change_percent,
                volume=volume,
                previous_close=previous_close,
                market_cap=market_cap,
                pe_ratio=pe_ratio,
                week_52_high=week_52_high,
                week_52_low=week_52_low,
                eps=eps,
                dividend_yield=dividend_yield,
                dividend_per_share=dividend_per_share,
                description=description
            )
            db.session.add(stock)
            
        try:
            db.session.commit()
            print("Successfully seeded S&P 500 stocks.")
        except Exception as e:
            db.session.rollback()
            print(f"Error seeding stocks: {e}")


def get_yahoo_quote(symbol):
    """Fetches real-time stock price and close from public keyless Yahoo Finance API."""
    symbol = symbol.upper()
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        headers = {'User-Agent': 'Mozilla/5.0'}
        response = requests.get(url, headers=headers, timeout=5)
        if response.status_code == 200:
            data = response.json()
            result = data.get('chart', {}).get('result')
            if result and len(result) > 0:
                meta = result[0].get('meta', {})
                price = meta.get('regularMarketPrice')
                prev_close = meta.get('chartPreviousClose')
                
                # Calculate change and change percent
                if price is not None and prev_close is not None:
                    change = round(price - prev_close, 2)
                    change_percent = f"{round((change / prev_close) * 100, 2)}%" if prev_close != 0 else "0%"
                else:
                    change = 0.0
                    change_percent = "0%"
                
                # Try to get volume from indicators
                indicators = result[0].get('indicators', {})
                quote_list = indicators.get('quote', [{}])
                volume = 0
                if quote_list and len(quote_list) > 0:
                    volumes = quote_list[0].get('volume', [])
                    valid_volumes = [v for v in volumes if v is not None]
                    if valid_volumes:
                        volume = int(valid_volumes[-1])
                
                return {
                    'symbol': symbol,
                    'price': float(price) if price is not None else 0.0,
                    'change': float(change),
                    'change_percent': change_percent,
                    'volume': volume,
                    'previous_close': float(prev_close) if prev_close is not None else 0.0
                }
    except Exception as e:
        print(f"Yahoo Finance API error: {e}")
    return None


def get_quote(symbol):
    """Current price, change, volume — the live price data"""
    symbol = symbol.upper()
    
    # 1. Try Yahoo Finance first to ensure keyless accurate live stock data
    yahoo_quote = get_yahoo_quote(symbol)
    if yahoo_quote:
        return yahoo_quote

    # 2. Try Alpha Vantage (if a custom non-demo API key is configured)
    if API_KEY and API_KEY != "demo":
        try:
            response = requests.get(BASE_URL, params={
                'function': 'GLOBAL_QUOTE',
                'symbol': symbol,
                'apikey': API_KEY
            }, timeout=15)
            response.raise_for_status()
            data = response.json()
            quote = data.get('Global Quote', {})
            if quote and '05. price' in quote:
                return {
                    'symbol': quote.get('01. symbol'),
                    'price': float(quote.get('05. price', 0)),
                    'change': float(quote.get('09. change', 0)),
                    'change_percent': quote.get('10. change percent', '0%'),
                    'volume': int(quote.get('06. volume', 0)),
                    'previous_close': float(quote.get('08. previous close', 0)),
                }
        except Exception as e:
            print(f"Alpha Vantage API error: {e}")

    # Fallback to local database
    from app.models.Stock import Stock
    stock = Stock.query.filter_by(symbol=symbol).first()
    if stock:
        return {
            'symbol': stock.symbol,
            'price': stock.price,
            'change': stock.change,
            'change_percent': stock.change_percent,
            'volume': stock.volume,
            'previous_close': stock.previous_close
        }
    return None


def get_company_overview(symbol):
    """Company info, fundamentals, PE ratio, market cap etc"""
    symbol = symbol.upper()
    if API_KEY and API_KEY != "demo":
        try:
            response = requests.get(BASE_URL, params={
                'function': 'OVERVIEW',
                'symbol': symbol,
                'apikey': API_KEY
            }, timeout=15)
            response.raise_for_status()
            data = response.json()
            if data and 'Symbol' in data:
                return {
                    'symbol': data.get('Symbol'),
                    'name': data.get('Name'),
                    'description': data.get('Description'),
                    'sector': data.get('Sector'),
                    'industry': data.get('Industry'),
                    'market_cap': int(data.get('MarketCapitalization', 0)),
                    'pe_ratio': float(data.get('PERatio', 0)) if data.get('PERatio') and data.get('PERatio') != 'None' else None,
                    'week_52_high': float(data.get('52WeekHigh', 0)),
                    'week_52_low': float(data.get('52WeekLow', 0)),
                    'dividend_yield': float(data.get('DividendYield', 0)),
                    'eps': float(data.get('EPS', 0)),
                }
        except Exception as e:
            print(f"Alpha Vantage API error: {e}")

    # Fallback to local database
    from app.models.Stock import Stock
    stock = Stock.query.filter_by(symbol=symbol).first()
    if stock:
        return {
            'symbol': stock.symbol,
            'name': stock.name,
            'description': stock.description,
            'sector': stock.sector,
            'industry': stock.industry,
            'market_cap': stock.market_cap,
            'pe_ratio': stock.pe_ratio,
            'week_52_high': stock.week_52_high,
            'week_52_low': stock.week_52_low,
            'dividend_yield': stock.dividend_yield,
            'eps': stock.eps,
        }
    return None


def get_full_stock_info(symbol):
    """
    Return merged quote + overview for a symbol.
    Checks the CSV cache first.
    """
    cached = _get_cached_symbol(symbol)
    if cached:
        print(f"[CACHE] Hit for {symbol}")
        # Merge live quote price into the cache record
        quote = get_quote(symbol)
        if quote:
            cached.update(quote)
        return cached

    print(f"[API] Fetching {symbol}...")
    quote = get_quote(symbol)
    time.sleep(1)
    overview = get_company_overview(symbol)

    if not quote or not overview:
        if not quote:
            print("quote breaks")
        if not overview:
            print("overview breaks")
        return None

    result = {**overview, **quote}
    _save_to_cache(result)
    return result


def write_market_data():
    """Fetch every S&P 500 stock and write to CSV."""
    stocks = getNamesOfStocks()
    for stock in stocks:
        get_full_stock_info(stock)
        time.sleep(12)


def read_market_data():
    """Read the entire CSV cache as a list of dicts."""
    return _load_cache()
