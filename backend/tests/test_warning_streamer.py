import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from services import warning_streamer as streamer


class WarningPublishingTests(unittest.TestCase):
    def test_publishes_accepted_warnings_with_iso_dates_and_no_mongo_id(self):
        producer = Mock()
        producer.flush.return_value = 0
        warning = {'symbol': 'AAPL', 'accepted': True, '_id': object(),
                   'created_at': datetime(2026, 10, 1, tzinfo=timezone.utc)}
        self.assertTrue(hasattr(streamer, 'publish_accepted_warnings'))
        self.assertEqual(streamer.publish_accepted_warnings(producer, [warning, {'accepted': False}]), 1)
        args, kwargs = producer.produce.call_args
        self.assertEqual(args, ('atlas.market.warnings',))
        self.assertEqual(kwargs['key'], 'AAPL')
        payload = json.loads(kwargs['value'])
        self.assertEqual(payload['created_at'], '2026-10-01T00:00:00+00:00')
        self.assertNotIn('_id', payload)
        self.assertIn('_id', warning)
        producer.poll.assert_called_once_with(0)
        producer.flush.assert_called_once_with(timeout=10)

    def test_publish_failure_does_not_block_save_or_commit(self):
        self.assertTrue(hasattr(streamer, 'create_producer'))
        producer = Mock()
        producer.produce.side_effect = RuntimeError('offline')
        consumer = Mock()
        message = Mock()
        message.error.return_value = None
        message.value.return_value = b'{"id":"event"}'
        def poll(_):
            streamer.SHOULD_STOP = True
            return message
        consumer.poll.side_effect = poll
        with patch.object(streamer, 'SHOULD_STOP', False), patch.object(streamer, 'create_consumer', return_value=consumer), patch.object(streamer, 'create_producer', return_value=producer), patch.object(streamer.signal, 'signal'), patch.object(streamer, 'analyze_news_event', return_value=[{'symbol': 'AAPL', 'accepted': True}]), patch.object(streamer, 'save_accepted_warnings', return_value=1) as save, patch('builtins.print') as log:
            streamer.run_forever()
        save.assert_called_once()
        consumer.commit.assert_called_once_with(message=message)
        consumer.close.assert_called_once()
        self.assertTrue(any('Failed to publish' in str(call) for call in log.call_args_list))

    def test_flush_failure_is_logged_without_losing_saved_warning(self):
        producer = Mock()
        producer.flush.side_effect = RuntimeError('flush failed')
        with patch.object(streamer, 'analyze_news_event', return_value=[{'accepted': True, 'symbol': 'AAPL'}]), patch.object(streamer, 'save_accepted_warnings', return_value=1) as save, patch('builtins.print') as log:
            self.assertEqual(streamer.process_news_event({'id': 'event'}, producer), 1)
        save.assert_called_once()
        self.assertTrue(any('Failed to publish' in str(call) for call in log.call_args_list))

    def test_save_failure_does_not_publish(self):
        producer = Mock()
        with patch.object(streamer, 'analyze_news_event', return_value=[]), patch.object(streamer, 'save_accepted_warnings', side_effect=RuntimeError('save failed')):
            with self.assertRaises(RuntimeError):
                streamer.process_news_event({}, producer)
        producer.produce.assert_not_called()

    def test_delivery_error_is_logged(self):
        self.assertTrue(hasattr(streamer, '_delivery_report'))
        with patch('builtins.print') as log:
            streamer._delivery_report(RuntimeError('delivery failed'), Mock())
        self.assertIn('Failed to publish', str(log.call_args))
