from app.extensions import db
from datetime import datetime

class Holding(db.Model):
    __tablename__ = 'holdings'

    id = db.Column(db.Integer, primary_key=True)
    portfolio_id = db.Column(db.Integer, db.ForeignKey('portfolios.id'), nullable=False)
    
    # what the user enters
    symbol = db.Column(db.String(10), nullable=False)
    shares = db.Column(db.Float, nullable=False)
    buy_price = db.Column(db.Float, nullable=False)
    date_bought = db.Column(db.Date, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'portfolio_id': self.portfolio_id,
            'symbol': self.symbol,
            'shares': self.shares,
            'buy_price': self.buy_price,
            'date_bought': self.date_bought.isoformat(),
        }

    def to_dict_with_live_data(self, current_price):
        """Called when viewing — adds calculated fields on top of stored data"""
        amount_invested = self.shares * self.buy_price
        current_value = self.shares * current_price
        gain_loss = current_value - amount_invested
        gain_loss_pct = ((current_value - amount_invested) / amount_invested) * 100

        # TODO: Calculation of volume/day change

        return {
            # what we stored
            'id': self.id,
            'portfolio_id': self.portfolio_id,
            'symbol': self.symbol,
            'shares': self.shares,
            'buy_price': self.buy_price,
            'date_bought': self.date_bought.isoformat(),

            # calculated from live price
            'current_price': current_price,
            'current_value': round(current_value, 2),
            'amount_invested': round(amount_invested, 2),
            'gain_loss': round(gain_loss, 2),
            'gain_loss_pct': round(gain_loss_pct, 2),
        }