"""Regression tests for warning-streamer ticker validation."""

import unittest
from unittest.mock import patch
import json

from services import warning_analysis


class SupportedTickerTests(unittest.TestCase):
    """The consumer must fail closed when its ticker data is unavailable."""

    def test_rejects_symbols_when_supported_universe_is_missing(self):
        """A broken image must not turn arbitrary article codes into stock warnings."""
        with patch.object(warning_analysis, "KNOWN_SYMBOLS", set()):
            self.assertFalse(warning_analysis._is_valid_symbol("BCOM"))

    @patch("services.warning_analysis.ai_service._call_claude")
    @patch("services.warning_analysis.ai_service._call_multiple_models", return_value=None)
    def test_uses_provider_priority_call_for_validated_event(self, mock_consensus, mock_provider):
        """A validated event must use the configured AI provider before heuristic fallback."""
        mock_provider.return_value = json.dumps(
            {
                "warnings": [
                    {
                        "symbol": "NVDA",
                        "company_name": "NVIDIA Corporation",
                        "sentiment": "positive",
                        "impact_score": 72,
                        "reasoning": "NVIDIA announced a material data-center contract. The deal adds a near-term revenue catalyst.",
                        "accepted": True,
                        "accepted_reason": "A concrete company-specific contract was announced.",
                        "time_horizon": "near-term",
                    }
                ]
            }
        )

        warnings = warning_analysis.analyze_news_event(
            {
                "id": "event-1",
                "title": "NVIDIA announces a data-center contract",
                "description": "The contract is expected to increase revenue.",
                "link": "https://example.com/nvda",
                "symbols": ["NVDA"],
                "source_validated": True,
                "article": {"text": "NVIDIA announced the contract."},
            }
        )

        self.assertEqual(len(warnings), 1)
        self.assertEqual(warnings[0]["symbol"], "NVDA")
        mock_provider.assert_called_once()
        mock_consensus.assert_not_called()

    @patch("services.warning_analysis.ai_service._call_multiple_models", return_value=None)
    def test_rejects_unvalidated_event_before_fallback_analysis(self, mock_consensus):
        """Old Kafka messages cannot create warnings through the keyword fallback."""
        warnings = warning_analysis.analyze_news_event(
            {
                "id": "old-event",
                "title": "Apple falls behind during a local softball game",
                "symbols": ["AAPL"],
                "article": {"text": "Apple fell behind in the match."},
            }
        )

        self.assertEqual(warnings, [])

    @patch("services.warning_analysis.ai_service._call_claude", return_value=None)
    def test_fallback_rejects_company_story_without_a_market_driver(self, mock_provider):
        """Fallback analysis must not call a softball result an Apple stock warning."""
        warnings = warning_analysis.analyze_news_event(
            {
                "id": "sports-event",
                "title": "Apple falls behind during a local softball game",
                "symbols": ["AAPL"],
                "source_validated": True,
                "article": {"text": "Apple fell behind in the match."},
            }
        )

        self.assertEqual(warnings, [])
        mock_provider.assert_called_once()


if __name__ == "__main__":
    unittest.main()
