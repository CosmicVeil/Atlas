import importlib
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, MagicMock, patch


class PredictionTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('services.prediction_streamer'), 'prediction streamer is required')
        self.streamer = importlib.import_module('services.prediction_streamer')
        self.store = importlib.import_module('services.prediction_store')
        self.real_collection = self.store.get_predictions_collection
        self.real_recent = self.streamer.load_recent_warnings
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        csv = Path(self.tmp.name) / 'stock.csv'
        csv.write_text('symbol,name,price,sector,pe_ratio,eps\nAAPL,Apple,100,Technology,25,4\n')
        self.patch(self.streamer.market_data, 'CSV_PATH', str(csv))
        self.quote = self.patch(self.streamer.market_data, 'get_quote', return_value={'price': 120})
        self.collection = Mock()
        self.collection.find_one.return_value = None
        self.patch(self.store, 'get_predictions_collection', return_value=self.collection)
        self.warning = {'symbol': 'AAPL', 'warning_key': 'w1', 'accepted': True,
                        'headline': 'New contract', 'sentiment': 'positive', 'impact_score': 82,
                        'reasoning': 'Revenue increases', 'time_horizon': 'near-term'}
        self.recent = self.patch(self.streamer, 'load_recent_warnings', return_value=[])
        self.model = self.patch(self.streamer.ai_service, '_call_multiple_models', return_value=json.dumps({
            'recommendation': 'buy', 'prediction': 'bullish', 'confidence': 80,
            'targetPrice': 150, 'potentialReturn': 999, 'summary': 'News improves outlook',
            'pros': ['Growth'], 'cons': ['Cost'], 'riskFactors': ['Competition']}))

    def patch(self, obj, name, *args, **kwargs):
        p = patch.object(obj, name, *args, **kwargs)
        self.addCleanup(p.stop)
        return p.start()

    def test_prompt_uses_csv_fundamentals_recent_warnings_and_incoming_warning(self):
        self.recent.return_value = [dict(self.warning, warning_key='w0', headline='Prior contract')]
        self.assertTrue(self.streamer.process_warning(self.warning))
        system, prompt = self.model.call_args.args
        for value in ['Apple', 'Technology', '30.0', '120', 'New contract', 'Prior contract', 'positive', '82', 'Revenue increases', 'near-term']:
            self.assertIn(value, prompt)
        self.assertIn('news', (system + prompt).lower())
        self.assertNotIn('portfolio', (system + prompt).lower())
        fields = self.collection.update_one.call_args.args[1]['$set']
        self.assertEqual(fields['source_warning_keys'], ['w1', 'w0'])
        self.assertEqual(fields['potentialReturn'], 25.0)
        self.assertEqual(fields['price'], 120)
        self.assertEqual(fields['name'], 'Apple')
        self.assertEqual(fields['model_provider'], self.streamer.ai_service.NVIDIA_MODEL)

    def test_quote_falls_back_to_csv(self):
        self.quote.return_value = None
        self.assertTrue(self.streamer.process_warning(self.warning))
        fields = self.collection.update_one.call_args.args[1]['$set']
        self.assertEqual(fields['price'], 100)
        self.assertEqual(fields['potentialReturn'], 50)

    def test_live_quote_overrides_52_week_range_and_pe(self):
        self.quote.return_value = {'price': 120, 'week_52_high': 130.5, 'week_52_low': 90.25}
        self.assertTrue(self.streamer.process_warning(self.warning))
        _, prompt = self.model.call_args.args
        fundamentals = json.loads(prompt.split('Stock fundamentals: ', 1)[1].split('\n', 1)[0])
        self.assertEqual(fundamentals['week_52_high'], 130.5)
        self.assertEqual(fundamentals['week_52_low'], 90.25)
        self.assertEqual(fundamentals['pe_ratio'], 30.0)
        self.assertEqual(fundamentals['price'], 120)

    def test_prompt_has_no_placeholder_target_and_names_live_price(self):
        self.assertTrue(self.streamer.process_warning(self.warning))
        _, prompt = self.model.call_args.args
        self.assertNotIn('100.0', prompt)
        self.assertIn('$120', prompt)

    def test_rejects_target_that_contradicts_recommendation(self):
        cases = [('buy', 100), ('strong_buy', 120), ('sell', 150), ('strong_sell', 120), ('hold', 0), ('buy', None)]
        for recommendation, target in cases:
            with self.subTest(recommendation=recommendation, target=target), patch('builtins.print'):
                self.model.return_value = json.dumps({'recommendation': recommendation, 'targetPrice': target})
                self.assertFalse(self.streamer.process_warning(self.warning))
        self.collection.update_one.assert_not_called()

    def test_accepts_consistent_targets(self):
        for recommendation, target in [('buy', 150), ('sell', 90), ('hold', 100)]:
            with self.subTest(recommendation=recommendation):
                self.model.return_value = json.dumps({'recommendation': recommendation, 'targetPrice': target})
                self.assertTrue(self.streamer.process_warning(self.warning))

    def test_upserts_same_symbol_preserving_creation_time(self):
        for _ in range(2):
            self.streamer.process_warning(self.warning)
        for call in self.collection.update_one.call_args_list:
            query, update = call.args
            self.assertEqual(query, {'symbol': 'AAPL'})
            self.assertEqual(call.kwargs, {'upsert': True})
            self.assertIn('created_at', update['$setOnInsert'])
            self.assertNotIn('created_at', update['$set'])
            self.assertIsNotNone(update['$set']['updated_at'].tzinfo)

    def test_skips_redelivered_warning(self):
        self.collection.find_one.return_value = {'source_warning_keys': ['w1']}
        self.assertFalse(self.streamer.process_warning(self.warning))
        self.collection.find_one.assert_called_once_with({'symbol': 'AAPL', 'source_warning_keys': 'w1'})
        self.model.assert_not_called()
        self.collection.update_one.assert_not_called()

    def test_missing_and_unknown_symbols_do_not_call_model(self):
        for warning in [{}, {'symbol': 'UNKNOWN'}]:
            self.assertFalse(self.streamer.process_warning(warning))
        self.model.assert_not_called()

    def test_invalid_model_results_never_write_simulations(self):
        for response in ['', None, 'not json', '[]', 'null', '{"recommendation":"maybe"}']:
            with self.subTest(response=response), patch('builtins.print') as log:
                self.model.return_value = response
                self.assertFalse(self.streamer.process_warning(self.warning))
                self.assertTrue(log.called)
        self.collection.update_one.assert_not_called()

    def test_recent_warnings_query_limits_and_window(self):
        # Stop just this patch so this test exercises the real database query.
        collection = Mock()
        collection.find.return_value.sort.return_value.limit.return_value = [self.warning]
        with patch.object(self.streamer.warning_store, 'get_warnings_collection', return_value=collection):
            before = datetime.now(timezone.utc) - timedelta(days=14)
            self.assertEqual(self.real_recent('AAPL'), [self.warning])
            query = collection.find.call_args.args[0]
            self.assertEqual(query['symbol'], 'AAPL')
            self.assertTrue(query['accepted'])
            self.assertGreaterEqual(query['created_at']['$gte'], before)
            collection.find.return_value.sort.assert_called_once_with('created_at', -1)
            collection.find.return_value.sort.return_value.limit.assert_called_once_with(10)

    def test_consumer_commits_model_failure_but_not_store_failure(self):
        for error, commits in [(None, 1), (RuntimeError('mongo offline'), 0)]:
            with self.subTest(error=error):
                consumer = Mock()
                message = Mock()
                message.error.return_value = None
                message.value.return_value = json.dumps(self.warning).encode()
                def poll(_):
                    self.streamer.SHOULD_STOP = True
                    return message
                consumer.poll.side_effect = poll
                with patch.object(self.streamer, 'SHOULD_STOP', False), patch.object(self.streamer, 'create_consumer', return_value=consumer), patch.object(self.streamer.signal, 'signal'), patch.object(self.streamer, 'process_warning', return_value=False, side_effect=error):
                    self.streamer.run_forever()
                self.assertEqual(consumer.commit.call_count, commits)
                consumer.close.assert_called_once()

    def test_store_read_queries_return_symbols_and_timestamps(self):
        when = datetime(2026, 10, 1, tzinfo=timezone.utc)
        doc = {'symbol': 'AAPL', 'updated_at': when}
        self.collection.find.return_value = [doc]
        self.assertEqual(self.store.get_predictions_by_symbol(), {'AAPL': doc})
        self.collection.find.assert_called_with({})
        self.assertEqual(self.store.get_predictions_by_symbol(['aapl']), {'AAPL': doc})
        self.collection.find.assert_called_with({'symbol': {'$in': ['AAPL']}})
        self.collection.find_one.return_value = doc
        self.assertEqual(self.store.get_prediction('aapl'), doc)
        self.collection.find_one.assert_called_with({'symbol': 'AAPL'})
        self.assertEqual(self.store.get_latest_prediction_time(), when)
        self.collection.find_one.assert_called_with({}, sort=[('updated_at', -1)])
        cursor = Mock()
        cursor.sort.return_value = [doc, {'symbol': 'MSFT'}]
        self.collection.find.return_value = cursor
        self.assertEqual(self.store.get_prediction_symbols_since(when), ['AAPL', 'MSFT'])
        self.collection.find.assert_called_with({'updated_at': {'$gt': when}})
        cursor.sort.assert_called_once_with('updated_at', -1)
        self.assertEqual(self.store.serialize_time(when), '2026-10-01T00:00:00+00:00')
        self.assertIsNone(self.store.serialize_time(None))

    def test_consumer_configuration_and_waits_for_missing_topic(self):
        with patch.object(self.streamer, 'Consumer') as constructor:
            self.streamer.create_consumer()
        self.assertEqual(constructor.call_args.args[0], {
            'bootstrap.servers': self.streamer.KAFKA_BOOTSTRAP_SERVERS,
            'group.id': 'atlas-prediction-streamer',
            'auto.offset.reset': 'earliest', 'enable.auto.commit': False})
        consumer = Mock()
        message = Mock()
        message.error.return_value.code.return_value = self.streamer.KafkaError.UNKNOWN_TOPIC_OR_PART
        def poll(_):
            self.streamer._stop_streamer(None, None)
            return message
        consumer.poll.side_effect = poll
        with patch.object(self.streamer, 'SHOULD_STOP', False), patch.object(self.streamer, 'create_consumer', return_value=consumer), patch.object(self.streamer.signal, 'signal'):
            self.streamer.run_forever()
        consumer.subscribe.assert_called_once_with(['atlas.market.warnings'])
        consumer.commit.assert_not_called()
        consumer.close.assert_called_once()

    def test_store_indexes_and_read_failure_fallbacks(self):
        # Exercise connection setup through the real function, with only Mongo mocked.
        client = MagicMock()
        with patch.object(self.store, 'MongoClient', return_value=client) as constructor:
            coll = self.real_collection()
            self.assertEqual(constructor.call_args.kwargs, dict(serverSelectionTimeoutMS=1000, connectTimeoutMS=1000, socketTimeoutMS=1000, tz_aware=True))
            coll.create_index.assert_any_call('symbol', unique=True)
            coll.create_index.assert_any_call([('updated_at', -1)])
        with patch.object(self.store, 'get_predictions_collection', side_effect=RuntimeError('offline')):
            self.assertEqual(self.store.get_predictions_by_symbol(), {})
            self.assertIsNone(self.store.get_prediction('AAPL'))
            self.assertIsNone(self.store.get_latest_prediction_time())
            self.assertEqual(self.store.get_prediction_symbols_since(datetime.now(timezone.utc)), [])
            with self.assertRaises(RuntimeError):
                self.store.upsert_prediction({'symbol': 'AAPL'})
