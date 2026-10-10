"""Regression tests for the market-news producer's admission checks."""

import importlib
import os
import unittest
from unittest.mock import patch

from services import news


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = dict(documents or {})

    def find_one(self, query):
        return self.documents.get(query["_id"])

    def update_one(self, query, update, upsert=False):
        self.documents[query["_id"]] = {"_id": query["_id"], **update["$set"]}


class FailingCollection:
    def find_one(self, query):
        raise RuntimeError("mongo lookup failed")

    def update_one(self, query, update, upsert=False):
        raise RuntimeError("mongo write failed")


class WriteFailingCollection:
    def find_one(self, query):
        return None

    def update_one(self, query, update, upsert=False):
        raise RuntimeError("mongo write failed")


class FakeKafkaMessage:
    def topic(self):
        return news.KAFKA_TOPIC

    def partition(self):
        return 0

    def offset(self):
        return 1


class FakeProducer:
    def __init__(self, failed_indexes=None):
        self.calls = []
        self.failed_indexes = set(failed_indexes or [])
        self.delivered = 0

    def produce(self, topic, key, value, callback):
        self.calls.append({"topic": topic, "key": key, "value": value, "callback": callback})

    def poll(self, timeout):
        return 0

    def flush(self, timeout=None):
        while self.delivered < len(self.calls):
            index = self.delivered
            call = self.calls[index]
            self.delivered += 1
            error = RuntimeError("delivery failed") if index in self.failed_indexes else None
            call["callback"](error, FakeKafkaMessage())
        return 0


def apple_item(article_id, title=None):
    return {
        "article_id": article_id,
        "title": title or f"Apple story {article_id}",
        "link": f"https://example.com/{article_id}",
        "pubDate": "2026-01-01 00:00:00",
        "symbol": ["aapl"],
    }


class BuildNewsMessageTests(unittest.TestCase):
    """Ensure only Atlas-supported market symbols enter the Kafka topic."""

    @patch("services.news.fetch_market_quotes", return_value={})
    @patch(
        "services.news.scrape_article",
        return_value={"url": "https://example.com/article", "domain": "example.com", "text": "", "scrape_error": ""},
    )
    def test_keeps_supported_symbol_and_discards_provider_noise(self, mock_scrape, mock_quotes):
        """A real symbol is retained while exchange-specific provider codes are ignored."""
        message = news.build_news_message(
            {
                "title": "Walmart announces a new store initiative",
                "link": "https://example.com/article",
                "symbol": ["wmt", "0r1w", "1wmt"],
            }
        )

        self.assertEqual(message["symbols"], ["WMT"])
        mock_scrape.assert_called_once_with("https://example.com/article")
        mock_quotes.assert_called_once_with(["WMT"])

    @patch("services.news.fetch_market_quotes")
    @patch("services.news.scrape_article")
    def test_rejects_item_without_an_atlas_supported_symbol(self, mock_scrape, mock_quotes):
        """Global business stories without a supported stock must not be scraped or published."""
        message = news.build_news_message(
            {
                "title": "Government administration reforms announced",
                "link": "https://example.com/article",
                "symbol": ["910", "bcom"],
            }
        )

        self.assertIsNone(message)
        mock_scrape.assert_not_called()
        mock_quotes.assert_not_called()

    @patch("services.news.fetch_market_quotes")
    @patch("services.news.scrape_article")
    def test_rejects_exchange_code_attached_to_another_company_story(self, mock_scrape, mock_quotes):
        """An exchange label such as NASDAQ: ZG must not become an NDAQ warning."""
        # ZG is pinned as unsupported so this test does not depend on the stock list.
        with patch.object(news, "SUPPORTED_SYMBOLS", news.SUPPORTED_SYMBOLS - {"ZG"}):
            message = news.build_news_message(
                {
                    "title": "NASDAQ: ZG investor alert for Zillow Group shareholders",
                    "description": "A law firm announced a deadline for Zillow investors.",
                    "link": "https://example.com/article",
                    "symbol": ["ndaq", "zg"],
                }
            )

        self.assertIsNone(message)
        mock_scrape.assert_not_called()
        mock_quotes.assert_not_called()

    @patch("services.news.fetch_market_quotes", return_value={})
    @patch(
        "services.news.scrape_article",
        return_value={"url": "https://example.com/article", "domain": "example.com", "text": "", "scrape_error": ""},
    )
    def test_supported_story_company_keeps_only_its_own_symbol(self, mock_scrape, mock_quotes):
        """When the story's company is supported, the exchange label still adds no NDAQ symbol."""
        with patch.object(news, "SUPPORTED_SYMBOLS", news.SUPPORTED_SYMBOLS | {"ZG", "NDAQ"}), \
                patch.dict(news.SUPPORTED_STOCKS, {"ZG": "Zillow Group, Inc.", "NDAQ": "Nasdaq, Inc."}):
            message = news.build_news_message(
                {
                    "title": "NASDAQ: ZG investor alert for Zillow Group shareholders",
                    "description": "A law firm announced a deadline for Zillow investors.",
                    "link": "https://example.com/article",
                    "symbol": ["ndaq", "zg"],
                }
            )

        self.assertEqual(message["symbols"], ["ZG"])

    @patch("services.news.fetch_market_quotes")
    @patch("services.news.scrape_article")
    def test_passes_company_matched_story_to_ai_review(self, mock_scrape, mock_quotes):
        """The AI, not a narrow keyword list, decides whether an Apple story matters."""
        message = news.build_news_message(
            {
                "title": "Apple employees celebrate a local sports championship",
                "link": "https://example.com/article",
                "symbol": ["aapl"],
            }
        )

        self.assertIsNotNone(message)
        self.assertEqual(message["symbols"], ["AAPL"])
        mock_scrape.assert_called_once()
        mock_quotes.assert_called_once_with(["AAPL"])

    @patch("services.news.fetch_market_quotes", return_value={})
    @patch(
        "services.news.scrape_article",
        return_value={"url": "https://example.com/tesla", "domain": "example.com", "text": "", "scrape_error": ""},
    )
    def test_accepts_product_story_for_company_name_with_csv_punctuation(self, mock_scrape, mock_quotes):
        """Tesla product news must match the CSV name Tesla, Inc. and reach Kafka."""
        message = news.build_news_message(
            {
                "title": "Tesla Model Y to get AI5 FSD chip on advanced 2 nm process",
                "link": "https://example.com/tesla",
                "symbol": ["tsla"],
            }
        )

        self.assertIsNotNone(message)
        self.assertEqual(message["symbols"], ["TSLA"])
        mock_scrape.assert_called_once_with("https://example.com/tesla")
        mock_quotes.assert_called_once_with(["TSLA"])


class PublishMarketNewsMemoryTests(unittest.TestCase):
    def setUp(self):
        self.settings = patch.multiple(news, NEWS_API_KEY="test-key", NEWS_API_SIZE=10, MAX_NEWS_PAGES=5)
        self.settings.start()
        self.addCleanup(self.settings.stop)
        self.scrape = patch.object(
            news,
            "scrape_article",
            return_value={"url": "", "domain": "", "text": "", "scrape_error": ""},
        )
        self.quotes = patch.object(news, "fetch_market_quotes", return_value={})
        self.scrape.start()
        self.quotes.start()
        self.addCleanup(self.scrape.stop)
        self.addCleanup(self.quotes.stop)

    def run_pages(self, pages, collection, producer=None):
        producer = producer or FakeProducer()
        with patch.object(news.SESSION, "get", side_effect=[FakeResponse(page) for page in pages]) as get:
            with patch.object(news, "get_seen_collection", return_value=collection):
                with patch("builtins.print") as printed:
                    result = news.publish_market_news(producer)
        return result, producer, get, printed

    def test_seen_key_prefers_article_id_and_falls_back_to_message_id(self):
        item = apple_item("provider-id")
        self.assertEqual(news._seen_key(item), "provider-id")
        item.pop("article_id")
        message = news.build_news_message(item)
        self.assertEqual(news._seen_key(item), message["id"])

    def test_skips_already_seen_articles_and_publishes_new_ones(self):
        collection = FakeCollection({"a1": {"_id": "a1"}})
        result, producer, _, printed = self.run_pages(
            [{"results": [apple_item("a1"), apple_item("a2")]}], collection
        )
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)
        self.assertIn("a2", collection.documents)
        self.assertTrue(any("1 skipped as already seen" in str(call) for call in printed.call_args_list))

    def test_follows_next_page_until_size_new_articles_published(self):
        with patch.object(news, "NEWS_API_SIZE", 2):
            pages = [
                {"results": [apple_item("a1")], "nextPage": "p2"},
                {"results": [apple_item("a2"), apple_item("a3"), apple_item("a4")], "nextPage": "p3"},
            ]
            result, producer, get, _ = self.run_pages(pages, FakeCollection({"a1": {"_id": "a1"}}))
        self.assertEqual(result, 2)
        self.assertEqual(len(producer.calls), 2)
        self.assertEqual(get.call_count, 2)
        self.assertEqual(get.call_args_list[1].kwargs["params"]["page"], "p2")

    def test_stops_after_max_news_pages(self):
        with patch.object(news, "MAX_NEWS_PAGES", 2):
            pages = [
                {"results": [apple_item("a1")], "nextPage": "p2"},
                {"results": [apple_item("a2")], "nextPage": "p3"},
            ]
            result, _, get, _ = self.run_pages(
                pages, FakeCollection({"a1": {"_id": "a1"}, "a2": {"_id": "a2"}})
            )
        self.assertEqual(result, 0)
        self.assertEqual(get.call_count, 2)

    def test_stops_when_no_next_page(self):
        result, producer, get, _ = self.run_pages([{"results": [apple_item("a1")]}], FakeCollection())
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)
        self.assertEqual(get.call_count, 1)

    def test_marks_seen_only_after_confirmed_delivery(self):
        collection = FakeCollection()
        page = {"results": [apple_item("a1"), apple_item("a2")]}
        result, _, _, _ = self.run_pages([page], collection, FakeProducer(failed_indexes={1}))
        self.assertEqual(result, 2)
        self.assertEqual(collection.documents["a1"]["status"], "published")
        self.assertNotIn("a2", collection.documents)

        result, producer, _, _ = self.run_pages([page], collection)
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)
        self.assertIn("a2", collection.documents)

    def test_remembers_unsupported_articles(self):
        item = {"article_id": "bad", "title": "Unsupported market item", "symbol": ["910"]}
        collection = FakeCollection()
        result, _, _, _ = self.run_pages([{"results": [item]}], collection)
        self.assertEqual(result, 0)
        self.assertEqual(collection.documents["bad"]["status"], "unsupported")

        with patch.object(news, "build_news_message", wraps=news.build_news_message) as build:
            result, _, _, printed = self.run_pages([{"results": [item]}], collection)
        self.assertEqual(result, 0)
        build.assert_not_called()
        self.assertTrue(any("1 skipped as already seen" in str(call) for call in printed.call_args_list))

    def test_duplicate_article_within_one_run_is_published_once(self):
        pages = [
            {"results": [apple_item("a1")], "nextPage": "p2"},
            {"results": [apple_item("a1")]},
        ]
        result, producer, _, _ = self.run_pages(pages, FakeCollection())
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)

    def test_get_seen_collection_returns_none_and_warns_when_mongo_unreachable(self):
        client = unittest.mock.MagicMock()
        client.admin.command.side_effect = RuntimeError("unreachable")
        with patch.object(news, "_mongo_client", None), patch.object(
            news, "MongoClient", return_value=client
        ), patch("builtins.print") as printed:
            self.assertIsNone(news.get_seen_collection())
        client.close.assert_called_once_with()
        self.assertTrue(any("MongoDB unavailable" in str(call) for call in printed.call_args_list))

        with patch.object(news, "_mongo_client", None), patch.object(
            news, "MongoClient", None
        ), patch("builtins.print") as printed:
            self.assertIsNone(news.get_seen_collection())
        self.assertTrue(any("MongoDB unavailable" in str(call) for call in printed.call_args_list))

    def test_get_seen_collection_reuses_one_client(self):
        client = unittest.mock.MagicMock()
        collection = client.__getitem__.return_value.__getitem__.return_value
        with patch.object(news, "_mongo_client", None), patch.object(
            news, "MongoClient", return_value=client
        ) as mongo_client:
            self.assertIs(news.get_seen_collection(), collection)
            self.assertIs(news.get_seen_collection(), collection)
        mongo_client.assert_called_once_with(
            news.MONGO_URI, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000
        )
        self.assertEqual(client.admin.command.call_count, 2)

    def test_publishes_without_memory_when_mongo_unavailable(self):
        with patch.object(news, "NEWS_API_SIZE", 2):
            result, producer, _, _ = self.run_pages(
                [{"results": [apple_item("a1"), apple_item("a2"), apple_item("a3")]}], None
            )
        self.assertEqual(result, 2)
        self.assertEqual(len(producer.calls), 2)

    def test_mongo_errors_during_run_do_not_crash(self):
        result, producer, _, printed = self.run_pages(
            [{"results": [apple_item("a1")]}], FailingCollection()
        )
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)
        self.assertTrue(any("MongoDB unavailable" in str(call) for call in printed.call_args_list))

        result, producer, _, printed = self.run_pages(
            [{"results": [apple_item("a2")]}], WriteFailingCollection()
        )
        self.assertEqual(result, 1)
        self.assertEqual(len(producer.calls), 1)
        self.assertTrue(any("mongo write failed" in str(call) for call in printed.call_args_list))

    def test_defaults_for_max_pages_and_seen_collection(self):
        original_max = os.environ.pop("MAX_NEWS_PAGES", None)
        original_collection = os.environ.pop("NEWS_SEEN_COLLECTION", None)
        try:
            importlib.reload(news)
            self.assertEqual(news.MAX_NEWS_PAGES, 10)
            self.assertEqual(news.NEWS_SEEN_COLLECTION, "news_seen_articles")
        finally:
            if original_max is not None:
                os.environ["MAX_NEWS_PAGES"] = original_max
            if original_collection is not None:
                os.environ["NEWS_SEEN_COLLECTION"] = original_collection
            importlib.reload(news)


if __name__ == "__main__":
    unittest.main()
