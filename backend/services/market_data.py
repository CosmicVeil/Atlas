import csv
import os
import requests
import time
import random
from datetime import date

# ── Config ──
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CSV_PATH = os.path.join(DATA_DIR, 'stock_info.csv')

# Alpha Vantage — used ONLY for company fundamentals (slow, cached)
ALPHA_KEY = os.environ.get('ALPHA_VANTAGE_KEY') or os.environ.get('ALPHA_VANTAGE_API_KEY') or "DEMO"
ALPHA_URL = 'https://www.alphavantage.co/query'

# ── In-memory cache for Yahoo Finance quotes ──
# Structure: {symbol: (timestamp, data)}
_QUOTE_CACHE = {}
_QUOTE_CACHE_TTL = 300  # 5 minutes between live refreshes

# ── Rate limiter ──
_MIN_REQUEST_INTERVAL = 4.0  # seconds between Yahoo requests (critical)
_last_request_time = 0.0

# ── Yahoo Finance (live price data, no key needed) ──
YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}'

_SESSION = requests.Session()
_SESSION.headers.update({
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    ),
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
})


# ── CSV helpers ──

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
            for num_field in ['price', 'change', 'market_cap', 'pe_ratio', 'peg_ratio',
                               'price_to_sales_ratio', 'price_to_book_ratio', 'book_value',
                               'ev_to_revenue', 'ev_to_ebitda', 'ebitda', 'revenue_ttm',
                               'gross_profit_ttm', 'profit_margin', 'operating_margin_ttm',
                               'quarterly_earnings_growth_yoy', 'quarterly_revenue_growth_yoy',
                               'return_on_assets_ttm', 'return_on_equity_ttm', 'dividend_per_share',
                               'dividend_yield', 'week_52_high', 'week_52_low', 'moving_avg_50',
                               'moving_avg_200', 'beta', 'trailing_pe', 'forward_pe',
                               'shares_outstanding', 'shares_float', 'percent_insiders',
                               'percent_institutions', 'analyst_target_price', 'analyst_strong_buy',
                               'analyst_buy', 'analyst_hold', 'analyst_sell', 'analyst_strong_sell',
                               'eps', 'volume', 'previous_close', 'revenue_per_share_ttm']:
                if num_field in row_dict and row_dict[num_field]:
                    try:
                        if num_field in ['market_cap', 'volume', 'ebitda', 'revenue_ttm',
                                          'gross_profit_ttm', 'shares_outstanding', 'shares_float',
                                          'analyst_strong_buy', 'analyst_buy', 'analyst_hold',
                                          'analyst_sell', 'analyst_strong_sell']:
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
        'asset_type', 'exchange', 'currency', 'country', 'official_site', 'address', 'cik',
        'market_cap', 'pe_ratio', 'peg_ratio', 'price_to_sales_ratio', 'price_to_book_ratio',
        'book_value', 'ev_to_revenue', 'ev_to_ebitda',
        'ebitda', 'revenue_ttm', 'revenue_per_share_ttm', 'gross_profit_ttm',
        'profit_margin', 'operating_margin_ttm',
        'quarterly_earnings_growth_yoy', 'quarterly_revenue_growth_yoy',
        'return_on_assets_ttm', 'return_on_equity_ttm',
        'dividend_per_share', 'dividend_yield', 'dividend_date', 'ex_dividend_date',
        'week_52_high', 'week_52_low', 'moving_avg_50', 'moving_avg_200', 'beta',
        'trailing_pe', 'forward_pe',
        'shares_outstanding', 'shares_float', 'percent_insiders', 'percent_institutions',
        'analyst_target_price', 'analyst_strong_buy', 'analyst_buy', 'analyst_hold',
        'analyst_sell', 'analyst_strong_sell',
        'fiscal_year_end', 'latest_quarter',
        'price', 'change', 'change_percent', 'volume', 'previous_close', 'eps'
    ]

    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        to_write = []
        for row in cache:
            cleaned = {k: row.get(k, '') for k in fieldnames}
            to_write.append(cleaned)
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(to_write)


# ── Yahoo Finance (live price data, no key needed) ──

def _enforce_rate_limit():
    """Sleep if necessary to respect the min interval between Yahoo requests."""
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        sleep_time = _MIN_REQUEST_INTERVAL - elapsed + random.uniform(0, 0.5)
        time.sleep(sleep_time)
    _last_request_time = time.time()


def get_quote(symbol):
    """
    Fetch real-time price data from Yahoo Finance.
    Uses an in-memory cache (5 min TTL), global rate limiting, and
    retry with jitter to avoid 429 rate-limit errors.
    Falls back to CSV / zeroes on total failure.
    """
    symbol = symbol.upper()
    now = time.time()

    # 1. Check in-memory cache
    cached = _QUOTE_CACHE.get(symbol)
    if cached:
        cached_at, data = cached
        if now - cached_at < _QUOTE_CACHE_TTL:
            return data

    # 2. Fetch from Yahoo with rate limiting
    url = YAHOO_CHART_URL.format(symbol=symbol)
    max_retries = 3
    for attempt in range(max_retries):
        try:
            _enforce_rate_limit()
            resp = _SESSION.get(url, timeout=10)
            resp.raise_for_status()
            payload = resp.json()

            result = payload.get('chart', {}).get('result', [])
            if not result:
                return None

            meta = result[0].get('meta', {})
            price = meta.get('regularMarketPrice')
            prev_close = meta.get('chartPreviousClose')

            root = result[0].get('indicators', {}).get('quote', [{}])[0]
            vols = root.get('volume', [])
            volume = int(vols[-1]) if vols and vols[-1] is not None else 0

            if price is None:
                return None

            price = float(price)
            prev_close = float(prev_close) if prev_close is not None else price
            change = round(price - prev_close, 2)
            change_pct = f"{round((change / prev_close) * 100, 2)}%" if prev_close != 0 else "0%"

            dataInsight = {
                'symbol': symbol,
                'price': price,
                'change': change,
                'change_percent': change_pct,
                'volume': volume,
                'previous_close': prev_close,
            }

            # Store in cache
            _QUOTE_CACHE[symbol] = (time.time(), dataInsight)
            return dataInsight

        except requests.exceptions.HTTPError as e:
            if resp.status_code == 429:
                # Rate limited — wait a bit longer
                print(f"[429] Rate limited on {symbol}, retrying...")
                time.sleep(random.uniform(3, 6))
                continue
            print(f"[ERROR] Yahoo Finance quote failed for {symbol}: {e}")
            break
        except Exception as e:
            print(f"[ERROR] Yahoo Finance quote failed for {symbol}: {e}")
            break

    # 3. Fallback to cached CSV data
    cached_row = _get_cached_symbol(symbol)
    if cached_row:
        print(f"[FALLBACK] Using cached CSV data for {symbol}")
        return {
            'symbol': symbol,
            'price': cached_row.get('price', 0),
            'change': cached_row.get('change', 0),
            'change_percent': cached_row.get('change_percent', '0%'),
            'volume': cached_row.get('volume', 0),
            'previous_close': cached_row.get('previous_close', 0),
        }

    print(f"[ERROR] Exceeded max retries and no CSV fallback for {symbol}")
    return None


# ── Alpha Vantage (company fundamentals, cached) ──

def get_company_overview(symbol):
    """Fetch company info, fundamentals, PE ratio, market cap from Alpha Vantage."""
    try:
        resp = requests.get(ALPHA_URL, params={
            'function': 'OVERVIEW',
            'symbol': symbol.upper(),
            'apikey': ALPHA_KEY
        }, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if not data or 'Symbol' not in data:
            return None

        def _float(val):
            try:
                return float(val) if val is not None and str(val).lower() != 'none' else None
            except (ValueError, TypeError):
                return None

        def _int(val):
            try:
                return int(float(val)) if val is not None and str(val).lower() != 'none' else None
            except (ValueError, TypeError):
                return None

        return {
            'symbol': data.get('Symbol'),
            'name': data.get('Name'),
            'description': data.get('Description'),
            'sector': data.get('Sector'),
            'industry': data.get('Industry'),
            'asset_type': data.get('AssetType'),
            'exchange': data.get('Exchange'),
            'currency': data.get('Currency'),
            'country': data.get('Country'),
            'official_site': data.get('OfficialSite'),
            'address': data.get('Address'),
            'cik': data.get('CIK'),
            'market_cap': _int(data.get('MarketCapitalization')),
            'pe_ratio': _float(data.get('PERatio')),
            'peg_ratio': _float(data.get('PEGRatio')),
            'price_to_sales_ratio': _float(data.get('PriceToSalesRatioTTM')),
            'price_to_book_ratio': _float(data.get('PriceToBookRatio')),
            'book_value': _float(data.get('BookValue')),
            'ev_to_revenue': _float(data.get('EVToRevenue')),
            'ev_to_ebitda': _float(data.get('EVToEBITDA')),
            'ebitda': _int(data.get('EBITDA')),
            'revenue_ttm': _int(data.get('RevenueTTM')),
            'revenue_per_share_ttm': _float(data.get('RevenuePerShareTTM')),
            'gross_profit_ttm': _int(data.get('GrossProfitTTM')),
            'profit_margin': _float(data.get('ProfitMargin')),
            'operating_margin_ttm': _float(data.get('OperatingMarginTTM')),
            'quarterly_earnings_growth_yoy': _float(data.get('QuarterlyEarningsGrowthYOY')),
            'quarterly_revenue_growth_yoy': _float(data.get('QuarterlyRevenueGrowthYOY')),
            'return_on_assets_ttm': _float(data.get('ReturnOnAssetsTTM')),
            'return_on_equity_ttm': _float(data.get('ReturnOnEquityTTM')),
            'dividend_per_share': _float(data.get('DividendPerShare')),
            'dividend_yield': _float(data.get('DividendYield')),
            'dividend_date': data.get('DividendDate'),
            'ex_dividend_date': data.get('ExDividendDate'),
            'week_52_high': _float(data.get('52WeekHigh')),
            'week_52_low': _float(data.get('52WeekLow')),
            'moving_avg_50': _float(data.get('50DayMovingAverage')),
            'moving_avg_200': _float(data.get('200DayMovingAverage')),
            'beta': _float(data.get('Beta')),
            'trailing_pe': _float(data.get('TrailingPE')),
            'forward_pe': _float(data.get('ForwardPE')),
            'shares_outstanding': _int(data.get('SharesOutstanding')),
            'shares_float': _int(data.get('SharesFloat')),
            'percent_insiders': _float(data.get('PercentInsiders')),
            'percent_institutions': _float(data.get('PercentInstitutions')),
            'analyst_target_price': _float(data.get('AnalystTargetPrice')),
            'analyst_strong_buy': _int(data.get('AnalystRatingStrongBuy')),
            'analyst_buy': _int(data.get('AnalystRatingBuy')),
            'analyst_hold': _int(data.get('AnalystRatingHold')),
            'analyst_sell': _int(data.get('AnalystRatingSell')),
            'analyst_strong_sell': _int(data.get('AnalystRatingStrongSell')),
            'fiscal_year_end': data.get('FiscalYearEnd'),
            'latest_quarter': data.get('LatestQuarter'),
            'eps': _float(data.get('EPS')),
        }
    except Exception as e:
        print(f"[ERROR] Alpha Vantage overview failed for {symbol}: {e}")
        return None


# ── Combined lookup ──

def get_full_stock_info(symbol):
    """
    Return merged quote (Yahoo live) + overview (Alpha Vantage cached).
    Checks the CSV cache first. If found, refreshes the live price from Yahoo
    but doesn't hit Alpha Vantage again.
    """
    cached = _get_cached_symbol(symbol)
    if cached:
        live_quote = get_quote(symbol)
        if live_quote:
            cached.update({
                'price': live_quote['price'],
                'change': live_quote['change'],
                'change_percent': live_quote['change_percent'],
                'volume': live_quote['volume'],
                'previous_close': live_quote['previous_close'],
            })
        return cached

    print(f"[API] Fetching {symbol}...")
    quote = get_quote(symbol)
    if not quote:
        print(f"[ERROR] Yahoo quote failed for {symbol}")
        return None

    time.sleep(1)

    overview = get_company_overview(symbol)
    if not overview:
        print(f"[ERROR] Alpha Vantage overview failed for {symbol}")
        return None

    result = {**overview, **quote}
    _save_to_cache(result)
    return result


# ── Bulk collection (build CSV over days) ──

def write_market_data():
    """
    Fetch every S&P 500 stock and write to CSV.
    Already-cached stocks are skipped (no API call).
    Uncached stocks are fetched and added.
    Run daily until the CSV is full.
    """
    stocks = getNamesOfStocks()
    for stock in stocks:
        # Already cached? Skip entirely
        if _get_cached_symbol(stock):
            print(f"[SKIP] {stock} already in CSV cache")
            continue
        get_full_stock_info(stock)
        # Wait generously between each stock (Yahoo + Alpha Vantage)
        time.sleep(20)


def read_market_data():
    """Read the entire CSV cache as a list of dicts."""
    return _load_cache()


# ── S&P 500 list helper ──

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


# ── DB seeding (called inside create_app only) ──

def seed_database_stocks():
    """Seed the SQLite database with S&P 500 companies. Called once at startup."""
    from app.extensions import db
    from app.models.Stock import Stock
    import random

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
            next(reader)  # skip header
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
                volume=str(volume),
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
