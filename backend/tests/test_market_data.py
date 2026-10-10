"""Tests for the top 1000 stock list: partial CSV rows and database seeding."""

import csv
import os
import tempfile
import unittest
from unittest.mock import patch

from flask import Flask

from app.extensions import db
from app.models.Stock import Stock
from services import market_data


CONSTITUENTS_HEADER = [
    "Symbol", "Security", "GICS Sector", "GICS Sub-Industry",
    "Headquarters Location", "Date added", "CIK", "Founded",
]


class CachedSymbolTests(unittest.TestCase):
    """Rows without a date only list the stock, so they must not count as fetched."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        csv_path = os.path.join(self.tmp.name, "stock_info.csv")
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["date", "symbol", "name", "sector", "industry", "price"])
            writer.writeheader()
            writer.writerow({"date": "2026-06-30", "symbol": "IBM", "name": "International Business Machines",
                             "sector": "Information Technology", "industry": "IT Services", "price": "281.21"})
            writer.writerow({"date": "", "symbol": "NET", "name": "Cloudflare Inc.",
                             "sector": "Information Technology", "industry": "Software", "price": ""})
        patcher = patch.multiple(market_data, DATA_DIR=self.tmp.name, CSV_PATH=csv_path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_fetched_row_is_cached(self):
        self.assertEqual(market_data._get_cached_symbol("ibm")["price"], 281.21)

    def test_row_without_date_is_not_cached(self):
        self.assertIsNone(market_data._get_cached_symbol("NET"))

    def test_unknown_symbol_is_not_cached(self):
        self.assertIsNone(market_data._get_cached_symbol("ZZZZ"))


class SeedDatabaseStocksTests(unittest.TestCase):
    """Seeding adds only the symbols missing from the database."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.write_constituents([("MMM", "3M"), ("NET", "Cloudflare Inc.")])
        patcher = patch.object(market_data, "DATA_DIR", self.tmp.name)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.app = Flask(__name__)
        self.app.config.update(SQLALCHEMY_DATABASE_URI="sqlite:///:memory:", SQLALCHEMY_TRACK_MODIFICATIONS=False)
        db.init_app(self.app)
        self.ctx = self.app.app_context()
        self.ctx.push()
        self.addCleanup(self.ctx.pop)
        db.create_all()
        self.addCleanup(db.drop_all)

    def write_constituents(self, stocks):
        with open(os.path.join(self.tmp.name, "constituents.csv"), "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(CONSTITUENTS_HEADER)
            for symbol, name in stocks:
                writer.writerow([symbol, name, "Industrials", "Conglomerates", "", "", "", ""])

    def symbols(self):
        return sorted(stock.symbol for stock in Stock.query.all())

    def test_seeds_empty_database(self):
        market_data.seed_database_stocks()
        self.assertEqual(self.symbols(), ["MMM", "NET"])

    def test_adds_new_constituents_to_existing_database(self):
        market_data.seed_database_stocks()
        mmm = Stock.query.filter_by(symbol="MMM").first()
        mmm.price = 123.45
        db.session.commit()

        self.write_constituents([("MMM", "3M"), ("NET", "Cloudflare Inc."), ("SNOW", "Snowflake Inc.")])
        market_data.seed_database_stocks()

        self.assertEqual(self.symbols(), ["MMM", "NET", "SNOW"])
        self.assertEqual(Stock.query.filter_by(symbol="MMM").first().price, 123.45)

    def test_skips_duplicate_symbols_in_file(self):
        self.write_constituents([("MMM", "3M"), ("MMM", "3M")])
        market_data.seed_database_stocks()
        self.assertEqual(self.symbols(), ["MMM"])


if __name__ == "__main__":
    unittest.main()
