from app.extensions import db
from datetime import datetime

class Stock(db.Model):
    __tablename__ = 'stocks'

    id = db.Column(db.Integer, primary_key=True)

    # --- Identity ---
    symbol = db.Column(db.String(10), unique=True, nullable=False)
    name = db.Column(db.String(200))
    asset_type = db.Column(db.String(50))           # Common Stock, ETF etc
    cik = db.Column(db.String(20))
    exchange = db.Column(db.String(20))             # NYSE, NASDAQ etc
    currency = db.Column(db.String(10))
    country = db.Column(db.String(50))
    official_site = db.Column(db.String(200))

    # --- Description ---
    description = db.Column(db.Text)
    sector = db.Column(db.String(100))
    industry = db.Column(db.String(100))
    address = db.Column(db.String(200))

    # --- Live Quote (updated frequently) ---
    price = db.Column(db.Float)
    change = db.Column(db.Float)
    change_percent = db.Column(db.String(20))
    volume = db.Column(db.BigInteger)
    previous_close = db.Column(db.Float)

    # --- Valuation ---
    market_cap = db.Column(db.BigInteger)
    pe_ratio = db.Column(db.Float)
    peg_ratio = db.Column(db.Float)
    price_to_sales_ratio = db.Column(db.Float)
    price_to_book_ratio = db.Column(db.Float)
    book_value = db.Column(db.Float)
    ev_to_revenue = db.Column(db.Float)
    ev_to_ebitda = db.Column(db.Float)

    # --- Financials ---
    ebitda = db.Column(db.BigInteger)
    eps = db.Column(db.Float)
    diluted_eps_ttm = db.Column(db.Float)
    revenue_ttm = db.Column(db.BigInteger)
    revenue_per_share_ttm = db.Column(db.Float)
    gross_profit_ttm = db.Column(db.BigInteger)
    profit_margin = db.Column(db.Float)
    operating_margin_ttm = db.Column(db.Float)

    # --- Growth ---
    quarterly_earnings_growth_yoy = db.Column(db.Float)
    quarterly_revenue_growth_yoy = db.Column(db.Float)

    # --- Returns ---
    return_on_assets_ttm = db.Column(db.Float)
    return_on_equity_ttm = db.Column(db.Float)

    # --- Dividends ---
    dividend_per_share = db.Column(db.Float)
    dividend_yield = db.Column(db.Float)
    dividend_date = db.Column(db.String(20))
    ex_dividend_date = db.Column(db.String(20))

    # --- Price History / Technicals ---
    week_52_high = db.Column(db.Float)
    week_52_low = db.Column(db.Float)
    moving_avg_50 = db.Column(db.Float)
    moving_avg_200 = db.Column(db.Float)
    beta = db.Column(db.Float)

    # --- PE ---
    trailing_pe = db.Column(db.Float)
    forward_pe = db.Column(db.Float)

    # --- Shares ---
    shares_outstanding = db.Column(db.BigInteger)
    shares_float = db.Column(db.BigInteger)
    percent_insiders = db.Column(db.Float)
    percent_institutions = db.Column(db.Float)

    # --- Analyst Ratings ---
    analyst_target_price = db.Column(db.Float)
    analyst_strong_buy = db.Column(db.Integer)
    analyst_buy = db.Column(db.Integer)
    analyst_hold = db.Column(db.Integer)
    analyst_sell = db.Column(db.Integer)
    analyst_strong_sell = db.Column(db.Integer)

    # --- Dates ---
    fiscal_year_end = db.Column(db.String(20))
    latest_quarter = db.Column(db.String(20))
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)

    def is_stale(self, hours=24):
        """Returns True if data hasn't been refreshed in X hours"""
        if not self.last_updated:
            return True
        diff = datetime.utcnow() - self.last_updated
        return diff.total_seconds() > (hours * 3600)

    def to_dict(self):
        return {
            # Identity
            'symbol': self.symbol,
            'name': self.name,
            'asset_type': self.asset_type,
            'exchange': self.exchange,
            'currency': self.currency,
            'country': self.country,
            'sector': self.sector,
            'industry': self.industry,
            'description': self.description,
            'official_site': self.official_site,
            'address': self.address,

            # Live Quote
            'price': self.price,
            'change': self.change,
            'change_percent': self.change_percent,
            'volume': self.volume,
            'previous_close': self.previous_close,

            # Valuation
            'market_cap': self.market_cap,
            'pe_ratio': self.pe_ratio,
            'peg_ratio': self.peg_ratio,
            'price_to_sales_ratio': self.price_to_sales_ratio,
            'price_to_book_ratio': self.price_to_book_ratio,
            'book_value': self.book_value,
            'ev_to_revenue': self.ev_to_revenue,
            'ev_to_ebitda': self.ev_to_ebitda,

            # Financials
            'ebitda': self.ebitda,
            'eps': self.eps,
            'revenue_ttm': self.revenue_ttm,
            'revenue_per_share_ttm': self.revenue_per_share_ttm,
            'gross_profit_ttm': self.gross_profit_ttm,
            'profit_margin': self.profit_margin,
            'operating_margin_ttm': self.operating_margin_ttm,

            # Growth
            'quarterly_earnings_growth_yoy': self.quarterly_earnings_growth_yoy,
            'quarterly_revenue_growth_yoy': self.quarterly_revenue_growth_yoy,

            # Returns
            'return_on_assets_ttm': self.return_on_assets_ttm,
            'return_on_equity_ttm': self.return_on_equity_ttm,

            # Dividends
            'dividend_per_share': self.dividend_per_share,
            'dividend_yield': self.dividend_yield,
            'dividend_date': self.dividend_date,
            'ex_dividend_date': self.ex_dividend_date,

            # Technicals
            'week_52_high': self.week_52_high,
            'week_52_low': self.week_52_low,
            'moving_avg_50': self.moving_avg_50,
            'moving_avg_200': self.moving_avg_200,
            'beta': self.beta,
            'trailing_pe': self.trailing_pe,
            'forward_pe': self.forward_pe,

            # Shares
            'shares_outstanding': self.shares_outstanding,
            'percent_insiders': self.percent_insiders,
            'percent_institutions': self.percent_institutions,

            # Analyst Ratings
            'analyst_target_price': self.analyst_target_price,
            'analyst_strong_buy': self.analyst_strong_buy,
            'analyst_buy': self.analyst_buy,
            'analyst_hold': self.analyst_hold,
            'analyst_sell': self.analyst_sell,
            'analyst_strong_sell': self.analyst_strong_sell,

            # Dates
            'fiscal_year_end': self.fiscal_year_end,
            'latest_quarter': self.latest_quarter,
            'last_updated': self.last_updated.isoformat() if self.last_updated else None,
        }

    @classmethod
    def from_api_data(cls, overview, quote):
        """Build a Stock instance directly from the two API responses"""
        def safe_float(val):
            try: return float(val)
            except (TypeError, ValueError): return None

        def safe_int(val):
            try: return int(val)
            except (TypeError, ValueError): return None

        return cls(
            # Identity
            symbol=overview.get('Symbol'),
            name=overview.get('Name'),
            asset_type=overview.get('AssetType'),
            cik=overview.get('CIK'),
            exchange=overview.get('Exchange'),
            currency=overview.get('Currency'),
            country=overview.get('Country'),
            official_site=overview.get('OfficialSite'),

            # Description
            description=overview.get('Description'),
            sector=overview.get('Sector'),
            industry=overview.get('Industry'),
            address=overview.get('Address'),

            # Live Quote
            price=safe_float(quote.get('05. price')),
            change=safe_float(quote.get('09. change')),
            change_percent=quote.get('10. change percent'),
            volume=safe_int(quote.get('06. volume')),
            previous_close=safe_float(quote.get('08. previous close')),

            # Valuation
            market_cap=safe_int(overview.get('MarketCapitalization')),
            pe_ratio=safe_float(overview.get('PERatio')),
            peg_ratio=safe_float(overview.get('PEGRatio')),
            price_to_sales_ratio=safe_float(overview.get('PriceToSalesRatioTTM')),
            price_to_book_ratio=safe_float(overview.get('PriceToBookRatio')),
            book_value=safe_float(overview.get('BookValue')),
            ev_to_revenue=safe_float(overview.get('EVToRevenue')),
            ev_to_ebitda=safe_float(overview.get('EVToEBITDA')),

            # Financials
            ebitda=safe_int(overview.get('EBITDA')),
            eps=safe_float(overview.get('EPS')),
            diluted_eps_ttm=safe_float(overview.get('DilutedEPSTTM')),
            revenue_ttm=safe_int(overview.get('RevenueTTM')),
            revenue_per_share_ttm=safe_float(overview.get('RevenuePerShareTTM')),
            gross_profit_ttm=safe_int(overview.get('GrossProfitTTM')),
            profit_margin=safe_float(overview.get('ProfitMargin')),
            operating_margin_ttm=safe_float(overview.get('OperatingMarginTTM')),

            # Growth
            quarterly_earnings_growth_yoy=safe_float(overview.get('QuarterlyEarningsGrowthYOY')),
            quarterly_revenue_growth_yoy=safe_float(overview.get('QuarterlyRevenueGrowthYOY')),

            # Returns
            return_on_assets_ttm=safe_float(overview.get('ReturnOnAssetsTTM')),
            return_on_equity_ttm=safe_float(overview.get('ReturnOnEquityTTM')),

            # Dividends
            dividend_per_share=safe_float(overview.get('DividendPerShare')),
            dividend_yield=safe_float(overview.get('DividendYield')),
            dividend_date=overview.get('DividendDate'),
            ex_dividend_date=overview.get('ExDividendDate'),

            # Technicals
            week_52_high=safe_float(overview.get('52WeekHigh')),
            week_52_low=safe_float(overview.get('52WeekLow')),
            moving_avg_50=safe_float(overview.get('50DayMovingAverage')),
            moving_avg_200=safe_float(overview.get('200DayMovingAverage')),
            beta=safe_float(overview.get('Beta')),
            trailing_pe=safe_float(overview.get('TrailingPE')),
            forward_pe=safe_float(overview.get('ForwardPE')),

            # Shares
            shares_outstanding=safe_int(overview.get('SharesOutstanding')),
            shares_float=safe_int(overview.get('SharesFloat')),
            percent_insiders=safe_float(overview.get('PercentInsiders')),
            percent_institutions=safe_float(overview.get('PercentInstitutions')),

            # Analyst
            analyst_target_price=safe_float(overview.get('AnalystTargetPrice')),
            analyst_strong_buy=safe_int(overview.get('AnalystRatingStrongBuy')),
            analyst_buy=safe_int(overview.get('AnalystRatingBuy')),
            analyst_hold=safe_int(overview.get('AnalystRatingHold')),
            analyst_sell=safe_int(overview.get('AnalystRatingSell')),
            analyst_strong_sell=safe_int(overview.get('AnalystRatingStrongSell')),

            # Dates
            fiscal_year_end=overview.get('FiscalYearEnd'),
            latest_quarter=overview.get('LatestQuarter'),
            last_updated=datetime.utcnow(),
        )