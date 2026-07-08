from flask import Flask
from app.config import Config
from app.extensions import db, jwt, cors
from app.api.auth.routes import auth_bp
from app.api.portfolio.routes import portfolio_bp
from app.api.holdings.routes import holdings_bp
from app.api.stock_data.routes import stocks_bp
from app.api.ai.routes import ai_bp
from app.api.news.routes import news_bp
from app.models import User, Portfolio, Holding, Stock


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    jwt.init_app(app)
    cors.init_app(app)  # type: ignore[argument-type]

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(portfolio_bp, url_prefix='/api/portfolios')
    app.register_blueprint(holdings_bp, url_prefix='/api/holdings')
    app.register_blueprint(stocks_bp, url_prefix='/api')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')
    app.register_blueprint(news_bp, url_prefix='/api/news')

    with app.app_context():
        db.create_all()  # creates the SQLite tables if they don't exist yet

        # Run schema migrations to add new columns if they do not exist
        for col_name, col_type in [
            ("ai_recommendation", "VARCHAR(20)"),
            ("ai_confidence", "INTEGER"),
            ("ai_summary", "TEXT"),
            ("ai_pros", "TEXT"),
            ("ai_cons", "TEXT"),
            ("ai_risk_factors", "TEXT"),
            ("ai_target_price", "FLOAT"),
            ("ai_prediction", "VARCHAR(20)")
        ]:
            try:
                db.session.execute(db.text(f"ALTER TABLE stocks ADD COLUMN {col_name} {col_type}"))
                db.session.commit()
            except Exception:
                db.session.rollback()

        from services.market_data import seed_database_stocks
        seed_database_stocks()

    return app
