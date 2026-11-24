"""Tests for the public Market News warning feed endpoint."""
import unittest
from unittest.mock import patch

from flask import Flask

from app.api.news import routes


class MarketWarningFeedTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.config.update(TESTING=True)
        app.register_blueprint(routes.news_bp, url_prefix='/api/news')
        self.client = app.test_client()

    def test_feed_is_public_and_reports_available_when_lookup_succeeds(self):
        feed = {'negative': [{'id': '1', 'symbol': 'AAPL'}], 'positive': []}
        with patch.object(routes, 'get_market_warnings', return_value=feed):
            res = self.client.get('/api/news/warnings')

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {**feed, 'available': True})

    def test_empty_feed_from_running_store_is_still_available(self):
        with patch.object(routes, 'get_market_warnings', return_value={'negative': [], 'positive': []}):
            body = self.client.get('/api/news/warnings').get_json()

        self.assertEqual(body, {'negative': [], 'positive': [], 'available': True})

    def test_store_failure_reports_unavailable_with_empty_lists(self):
        with patch.object(routes, 'get_market_warnings', side_effect=RuntimeError('mongo down')):
            res = self.client.get('/api/news/warnings')

        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json(), {'negative': [], 'positive': [], 'available': False})

    def test_limit_is_clamped_and_bad_values_fall_back_to_default(self):
        empty = {'negative': [], 'positive': []}
        with patch.object(routes, 'get_market_warnings', return_value=empty) as lookup:
            self.client.get('/api/news/warnings?limit=500')
            self.client.get('/api/news/warnings?limit=abc')

        self.assertEqual([c.kwargs['limit'] for c in lookup.call_args_list], [100, 50])


if __name__ == '__main__':
    unittest.main()
