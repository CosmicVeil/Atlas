import unittest

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token

from app.api.holdings.routes import holdings_bp
from app.api.portfolio.routes import portfolio_bp
from app.extensions import db
from app.models.holding import Holding
from app.models.portfolio import Portfolio
from app.models.Stock import Stock


class CreatePortfolioTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config.update(
            TESTING=True,
            SQLALCHEMY_DATABASE_URI="sqlite://",
            JWT_SECRET_KEY="offline-test-secret-with-at-least-32-characters",
        )
        db.init_app(app)
        JWTManager(app)
        app.register_blueprint(portfolio_bp, url_prefix="/api/portfolios")
        app.register_blueprint(holdings_bp, url_prefix="/api/holdings")
        context = app.app_context()
        context.push()
        self.addCleanup(context.pop)
        db.create_all()
        db.session.add_all([Stock(symbol="NXT"), Stock(symbol="MU")])
        db.session.commit()
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer " + create_access_token(identity="1")}

    def create_portfolio(self, **fields):
        return self.client.post("/api/portfolios/", json={"name": "AI Plan", **fields}, headers=self.headers)

    def test_saves_fractional_positions_at_suggested_prices(self):
        response = self.create_portfolio(holdings=[
            {"symbol": "nxt", "shares": 0.248533, "buy_price": 100.59},
            {"symbol": "MU", "shares": 0.030814, "buy_price": 811.30},
        ])
        self.assertEqual(response.status_code, 201)
        portfolio_id = response.get_json()["id"]
        saved = self.client.get(f"/api/holdings/{portfolio_id}/holdings", headers=self.headers).get_json()
        holdings = {holding["symbol"]: holding for holding in saved["holdings"]}
        self.assertEqual(holdings["NXT"]["shares"], 0.248533)
        self.assertEqual(holdings["MU"]["buy_price"], 811.30)

    def test_invalid_holding_leaves_no_partial_portfolio(self):
        response = self.create_portfolio(holdings=[
            {"symbol": "NXT", "shares": 0.25, "buy_price": 100.59},
            {"symbol": "UNKNOWN", "shares": 0.25, "buy_price": 100},
        ])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Portfolio.query.count(), 0)
        self.assertEqual(Holding.query.count(), 0)

    def test_creates_empty_portfolio_without_initial_holdings(self):
        self.assertEqual(self.create_portfolio().status_code, 201)
        self.assertEqual(Portfolio.query.count(), 1)
        self.assertEqual(Holding.query.count(), 0)
