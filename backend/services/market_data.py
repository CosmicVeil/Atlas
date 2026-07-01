import csv
import os
import requests
import time
from datetime import date

# ── Config ──
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CSV_PATH = os.path.join(DATA_DIR, 'stock_info.csv')

API_KEY = os.environ.get('ALPHA_VANTAGE_KEY')
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
            rows.append(row)
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
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cache)



def get_quote(symbol):
    """Fetch current price, change, volume."""
    response = requests.get(BASE_URL, params={
        'function': 'GLOBAL_QUOTE',
        'symbol': symbol,
        'apikey': API_KEY
    }, timeout=15)
    response.raise_for_status()
    data = response.json()
    quote = data.get('Global Quote', {})

    if not quote:
        return None

    return {
        'symbol': quote.get('01. symbol'),
        'price': float(quote.get('05. price', 0)),
        'change': float(quote.get('09. change', 0)),
        'change_percent': quote.get('10. change percent', '0%'),
        'volume': int(quote.get('06. volume', 0)),
        'previous_close': float(quote.get('08. previous close', 0)),
    }


def get_company_overview(symbol):
    """Fetch company info, fundamentals, PE ratio, market cap."""
    response = requests.get(BASE_URL, params={
        'function': 'OVERVIEW',
        'symbol': symbol,
        'apikey': API_KEY
    }, timeout=15)
    response.raise_for_status()
    data = response.json()

    if not data or 'Symbol' not in data:
        return None

    return {
        'symbol': data.get('Symbol'),
        'name': data.get('Name'),
        'description': data.get('Description'),
        'sector': data.get('Sector'),
        'industry': data.get('Industry'),
        'market_cap': data.get('MarketCapitalization'),
        'pe_ratio': data.get('PERatio'),
        'week_52_high': data.get('52WeekHigh'),
        'week_52_low': data.get('52WeekLow'),
        'dividend_yield': data.get('DividendYield'),
        'eps': data.get('EPS'),
    }


def get_full_stock_info(symbol):
    """
    Return merged quote + overview for a symbol.

    Checks the CSV cache first. If found, returns *immediately* without
    hitting the API — this lets you build out the CSV over days and
    eventually rely on it entirely.
    """
    cached = _get_cached_symbol(symbol)
    if cached:
        print(f"[CACHE] Hit for {symbol}")
        return cached

    print(f"[API] Fetching {symbol} from Alpha Vantage…")
    quote = get_quote(symbol)
    if not quote:
        print(f"[ERROR] Quote failed for {symbol}")
        return None

    time.sleep(1)  # Stay friendly to the free-tier rate limit

    overview = get_company_overview(symbol)
    if not overview:
        print(f"[ERROR] Overview failed for {symbol}")
        return None

    result = {**overview, **quote}
    _save_to_cache(result)
    return result



def write_market_data():
    """
    Fetch every S&P 500 stock and write to CSV.
    Already-cached stocks are skipped (no API call).
    Uncached stocks are fetched and added.
    Run daily until the CSV is full.
    """
    stocks = getNamesOfStocks()
    for stock in stocks:
        # get_full_stock_info handles the cache check internally
        get_full_stock_info(stock)
        # 12 s delay ≈ 5 calls / min on the free tier
        time.sleep(12)


def read_market_data():
    """Read the entire CSV cache as a list of dicts."""
    return _load_cache()



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
                names.append(row[0])
    return names
