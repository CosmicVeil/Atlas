from flask import Flask
from app.config import Config
from app.extensions import db, jwt, cors
from app.api.auth.routes import auth_bp
from app.api.portfolio.routes import portfolio_bp
from app.api.holdings.routes import holdings_bp
from app.api.stock_data.routes import stocks_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app)

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(portfolio_bp, url_prefix='/api/portfolios')
    app.register_blueprint(holdings_bp, url_prefix='/api/holdings')
    app.register_blueprint(stocks_bp, url_prefix='/api')

    with app.app_context():
        db.create_all()  # creates the SQLite tables if they don't exist yet

    return app
