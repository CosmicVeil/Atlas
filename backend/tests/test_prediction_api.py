import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from flask import Flask
from flask_jwt_extended import JWTManager, create_access_token
from pymongo.errors import ServerSelectionTimeoutError
from app.extensions import db
from app.models.Stock import Stock
from app.api.ai import routes
from services import prediction_store


class PredictionApiTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite://', JWT_SECRET_KEY='offline-test-secret-with-at-least-32-characters')
        db.init_app(self.app)
        JWTManager(self.app)
        self.app.register_blueprint(routes.ai_bp, url_prefix='/api/ai')
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        db.create_all()
        self.addCleanup(db.session.remove)
        db.session.add_all([
            Stock(last_updated=datetime.now() - timedelta(days=1), symbol='AAPL', name='Apple', price=100, ai_recommendation='sell', ai_target_price=80),
            Stock(last_updated=datetime.now() - timedelta(days=1), symbol='MSFT', name='Microsoft', price=100),
        ])
        db.session.commit()
        self.client = self.app.test_client()
        self.headers = {'Authorization': 'Bearer ' + create_access_token(identity='1')}
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache = Path(self.tmp.name) / 'cache.json'
        self.patch(routes, 'CACHE_FILE', str(self.cache))
        self.patch(routes, 'DATA_DIR', self.tmp.name)
        self.patch(routes.market_data, 'get_quote', return_value={'price': 120, 'change': 1, 'change_percent': '1%'})
        self.model = self.patch(routes.ai_service, 'analyze_stock', return_value={'isSimulated': True})
        self.simulation = self.patch(routes.ai_service, '_simulate_stock_analysis', return_value={'recommendation': 'hold', 'targetPrice': 110, 'pros': ['Local']})
        self.pred = dict(symbol='AAPL', name='Apple', price=100, recommendation='buy', prediction='bullish', confidence=88, targetPrice=150, summary='Contract lifts outlook', pros=['Growth'], cons=['Costs'], riskFactors=['Execution'], updated_at=datetime.now(timezone.utc))
        self.all_predictions = self.patch(prediction_store, 'get_predictions_by_symbol', return_value={'AAPL': self.pred})
        self.one_prediction = self.patch(prediction_store, 'get_prediction', return_value=self.pred)
        self.latest = self.patch(prediction_store, 'get_latest_prediction_time', return_value=self.pred['updated_at'])
        self.since = self.patch(prediction_store, 'get_prediction_symbols_since', return_value=['AAPL', 'MSFT'])

    def patch(self, obj, name, *args, **kwargs):
        p = patch.object(obj, name, *args, **kwargs)
        self.addCleanup(p.stop)
        return p.start()

    def entries(self, response):
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        return {s['ticker']: s for s in data['recommended'] + data['worst']}

    def test_news_overrides_sqlite_and_refresh_recomputes_live_return(self):
        for method, url in [('get', '/top-1000'), ('post', '/top-1000/refresh')]:
            with self.subTest(url=url):
                entries = self.entries(getattr(self.client, method)('/api/ai' + url, headers=self.headers))
                apple = entries['AAPL']
                self.assertEqual(apple.get('source'), 'news')
                self.assertEqual(apple['recommendation'], 'buy')
                self.assertEqual(apple['reasoning'], 'Contract lifts outlook')
                self.assertEqual(apple['keyPoints'], ['Growth'])
                self.assertEqual(apple['potentialReturn'], 25)
                self.assertEqual(apple['predictionUpdatedAt'], self.pred['updated_at'].isoformat())
                self.assertEqual(entries['MSFT']['source'], 'simulated')

    def test_news_overrides_simulation_and_other_entries_mark_model(self):
        self.all_predictions.return_value = {'MSFT': dict(self.pred, symbol='MSFT')}
        entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
        self.assertEqual(entries['MSFT'].get('source'), 'news')
        self.assertEqual(entries['AAPL']['source'], 'model')
        self.simulation.assert_not_called()

    def test_newer_prediction_rebuilds_before_response(self):
        self.cache.write_text(json.dumps({'lastUpdated': (datetime.now() - timedelta(minutes=1)).isoformat(), 'recommended': [{'ticker': 'AAPL', 'source': 'simulated'}], 'worst': []}))
        entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
        self.assertEqual(entries['AAPL'].get('source'), 'news')
        self.assertEqual(json.loads(self.cache.read_text())['recommended'][0]['source'], 'news')

    def test_prediction_arriving_during_rebuild_is_not_hidden_by_cache(self):
        started = datetime.now() - timedelta(seconds=10)
        clock = [started]

        class RebuildClock(datetime):
            @classmethod
            def now(cls, tz=None):
                return clock[0] if tz is None else clock[0].astimezone(tz)

        self.patch(routes, 'datetime', RebuildClock)
        self.pred['updated_at'] = (started + timedelta(seconds=1)).astimezone(timezone.utc)
        self.latest.return_value = self.pred['updated_at']

        def read_before_prediction_arrives():
            clock[0] = started + timedelta(seconds=2)
            return {}

        # Both refresh and the background worker use this generator.
        for rebuild in ('refresh', 'background_generator'):
            with self.subTest(rebuild=rebuild):
                clock[0] = started
                self.all_predictions.side_effect = read_before_prediction_arrives
                if rebuild == 'refresh':
                    response = self.client.post('/api/ai/top-1000/refresh', headers=self.headers)
                    self.assertEqual(self.entries(response)['AAPL']['source'], 'model')
                else:
                    routes._generate_and_cache_top_1000()

                self.all_predictions.side_effect = None
                self.all_predictions.return_value = {'AAPL': self.pred}
                entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
                self.assertEqual(entries['AAPL']['source'], 'news')
                self.assertEqual(entries['AAPL']['predictionUpdatedAt'], self.pred['updated_at'].isoformat())
                self.assertEqual(entries['AAPL']['potentialReturn'], 25)

    def test_deleted_news_prediction_is_not_reused_on_rebuild(self):
        self.all_predictions.return_value = {}
        self.cache.write_text(json.dumps({'recommended': [{'ticker': 'MSFT', 'source': 'news', 'targetPrice': 999}], 'worst': []}))
        entries = self.entries(self.client.post('/api/ai/top-1000/refresh', headers=self.headers))
        self.assertEqual(entries['MSFT'].get('source'), 'simulated')
        self.assertEqual(entries['MSFT']['targetPrice'], 110)

    def test_existing_cache_entries_gain_source_metadata(self):
        self.latest.return_value = None
        self.all_predictions.return_value = {}
        self.cache.write_text(json.dumps({'lastUpdated': datetime.now().isoformat(), 'recommended': [
            {'ticker': 'MSFT', 'targetPrice': 110}], 'worst': []}))
        entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
        self.assertEqual(entries['MSFT'].get('source'), 'simulated')

    def test_cached_news_is_removed_when_mongo_unavailable(self):
        self.latest.return_value = None
        self.all_predictions.return_value = {}
        self.cache.write_text(json.dumps({'lastUpdated': datetime.now().isoformat(), 'recommended': [
            {'ticker': 'MSFT', 'source': 'news', 'targetPrice': 999}], 'worst': []}))
        entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
        self.assertEqual(entries['MSFT']['source'], 'simulated')
        self.assertEqual(entries['MSFT']['targetPrice'], 110)

    def test_invalid_cache_timestamp_cannot_hide_news_or_error(self):
        self.cache.write_text(json.dumps({'lastUpdated': 'bad', 'recommended': [], 'worst': []}))
        entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
        self.assertEqual(entries['AAPL']['source'], 'news')

    def test_analyze_news_does_not_call_model(self):
        response = self.client.post('/api/ai/analyze', json={'symbol': 'aapl'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get('source'), 'news')
        self.assertEqual(data['ticker'], 'AAPL')
        self.assertEqual(data['currentPrice'], 120)
        self.assertEqual(data['summary'], 'Contract lifts outlook')
        self.assertEqual(data['potentialReturn'], 25)
        self.assertFalse(data['isSimulated'])
        self.assertEqual(data['riskFactors'], ['Execution'])
        self.assertEqual(data['predictionUpdatedAt'], self.pred['updated_at'].isoformat())
        self.model.assert_not_called()

    def test_analyze_fallback_sources(self):
        self.one_prediction.return_value = None
        for simulated, source in [(True, 'simulated'), (False, 'model')]:
            self.model.return_value = {'isSimulated': simulated}
            response = self.client.post('/api/ai/analyze', json={'symbol': 'AAPL'}, headers=self.headers)
            self.assertEqual(response.get_json().get('source'), source)

    def test_latest_without_since(self):
        response = self.client.get('/api/ai/predictions/latest', headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {'latestUpdatedAt': self.pred['updated_at'].isoformat()})
        self.since.assert_not_called()

    def test_latest_since_accepts_z_and_naive_as_utc(self):
        for since in ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00']:
            response = self.client.get('/api/ai/predictions/latest', query_string={'since': since}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json(), {'latestUpdatedAt': self.pred['updated_at'].isoformat(), 'count': 2, 'symbols': ['AAPL', 'MSFT']})
            self.since.assert_called_with(datetime(2026, 1, 1, tzinfo=timezone.utc))

    def test_latest_bad_timestamp_and_auth(self):
        response = self.client.get('/api/ai/predictions/latest?since=bad', headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json(), {'error': 'Invalid since timestamp'})
        self.assertEqual(self.client.get('/api/ai/predictions/latest').status_code, 401)

    def test_predictions_for_symbols_returns_only_known_tickers(self):
        response = self.client.get('/api/ai/predictions', query_string={'symbols': 'aapl, MSFT'}, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        predictions = response.get_json()['predictions']
        self.assertEqual([p['ticker'] for p in predictions], ['AAPL'])
        self.assertEqual(predictions[0]['source'], 'news')
        self.assertEqual(predictions[0]['recommendation'], 'buy')
        self.assertEqual(predictions[0]['predictionUpdatedAt'], self.pred['updated_at'].isoformat())
        self.all_predictions.assert_called_with(['AAPL', 'MSFT'])

    def test_predictions_for_symbols_empty_and_auth(self):
        response = self.client.get('/api/ai/predictions', headers=self.headers)
        self.assertEqual(response.get_json(), {'predictions': []})
        self.assertEqual(self.client.get('/api/ai/predictions?symbols=AAPL').status_code, 401)

    def test_mongo_down_degrades_without_errors(self):
        # Restore the real readers, then fail only their external Mongo boundary.
        for cleanup, _, _ in self._cleanups:
            patcher = getattr(cleanup, '__self__', None)
            if getattr(patcher, 'attribute', '') in ('get_predictions_by_symbol', 'get_prediction', 'get_latest_prediction_time', 'get_prediction_symbols_since'):
                patcher.stop()
        with patch.object(prediction_store, 'MongoClient', side_effect=ServerSelectionTimeoutError('offline')):
            entries = self.entries(self.client.get('/api/ai/top-1000', headers=self.headers))
            self.assertTrue(all(s.get('source') in ('model', 'simulated') for s in entries.values()))
            response = self.client.post('/api/ai/analyze', json={'symbol': 'AAPL'}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json()['source'], 'simulated')
            response = self.client.get('/api/ai/predictions/latest?since=2026-01-01T00:00:00Z', headers=self.headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.get_json(), {'latestUpdatedAt': None, 'count': 0, 'symbols': []})
