"""Regression tests for the market-news producer's admission checks."""

import unittest
from unittest.mock import patch

from services import news


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


if __name__ == "__main__":
    unittest.main()
