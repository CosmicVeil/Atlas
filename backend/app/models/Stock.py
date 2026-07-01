from app.extensions import db
from datetime import datetime
import json

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

    # --- AI Analysis ---
    ai_recommendation = db.Column(db.String(20))
    ai_confidence = db.Column(db.Integer)
    ai_summary = db.Column(db.Text)
    ai_pros = db.Column(db.Text)
    ai_cons = db.Column(db.Text)
    ai_risk_factors = db.Column(db.Text)
    ai_target_price = db.Column(db.Float)
    ai_prediction = db.Column(db.String(20))

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

    def is_stale(self, hours=24):
        """Returns True if data hasn't been refreshed in X hours"""
        if not self.last_updated:
            return True
        diff = datetime.utcnow() - self.last_updated
        return diff.total_seconds() > (hours * 3600)

    def to_dict(self, include_description=True):
        data = {
            # Identity
            'symbol': self.symbol,
            'name': self.name,
            'asset_type': self.asset_type,
            'exchange': self.exchange,
            'currency': self.currency,
            'country': self.country,
            'sector': self.sector,
            'industry': self.industry,
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

            # AI Analysis
            'ai_recommendation': self.ai_recommendation,
            'ai_confidence': self.ai_confidence,
            'ai_summary': self.ai_summary,
            'ai_pros': json.loads(self.ai_pros) if self.ai_pros else [],
            'ai_cons': json.loads(self.ai_cons) if self.ai_cons else [],
            'ai_risk_factors': json.loads(self.ai_risk_factors) if self.ai_risk_factors else [],
            'ai_target_price': self.ai_target_price,
            'ai_prediction': self.ai_prediction,
        }

        # Dynamically append description only if explicitly requested
        if include_description:
            data['description'] = self.description

        return data