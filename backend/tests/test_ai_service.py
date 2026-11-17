"""Regression tests for Atlas AI provider configuration."""

import unittest
from unittest.mock import Mock, patch

from services import ai_service


class NvidiaProviderTests(unittest.TestCase):
    """NVIDIA requests must target the supported Atlas model contract."""

    @patch("services.ai_service.requests.post")
    def test_request_uses_current_nemotron_model_and_options(self, mock_post):
        """A retired model alias or legacy thinking option must never reach NVIDIA."""
        mock_post.return_value = Mock(
            status_code=200,
            json=lambda: {
                "choices": [
                    {"message": {"content": '{"recommendation":"hold"}'}}
                ]
            },
        )

        with patch.object(ai_service, "NVIDIA_API_KEY", "test-key"):
            result = ai_service._call_nvidia("system", "user")

        self.assertEqual(result, '{"recommendation":"hold"}')
        request_payload = mock_post.call_args.kwargs["json"]
        self.assertEqual(
            request_payload["model"],
            "nvidia/nemotron-3.5-lightning-30b-a3b",
        )
        self.assertEqual(
            request_payload["chat_template_kwargs"],
            {"enable_thinking": False},
        )


class BudgetSuggestionsTests(unittest.TestCase):
    stocks = [
        {"symbol": "AAA", "name": "A", "price": 100, "sector": "Technology", "pe_ratio": 20},
        {"symbol": "BBB", "name": "B", "price": 200, "sector": "Health Care", "pe_ratio": 15},
    ]

    def test_model_allocations_are_converted_to_fractional_shares_at_atlas_prices(self):
        with patch.object(ai_service, "_call_claude", return_value=(
            '{"reasoning":"Split the budget","purchases":['
            '{"ticker":"AAA","allocation":25,"pricePerShare":1},'
            '{"ticker":"BBB","allocation":25}]}'
        )):
            result = ai_service.suggest_buys(50, available_stocks=self.stocks)

        self.assertFalse(result["isSimulated"])
        self.assertEqual([item["sharesToBuy"] for item in result["purchases"]], [0.25, 0.125])
        self.assertEqual(result["totalAllocated"], 50)
        self.assertEqual(result["remainingCash"], 0)

    def test_fallback_splits_a_budget_smaller_than_one_share(self):
        with patch.object(ai_service, "_call_claude", return_value=None):
            result = ai_service.suggest_buys(25.01, available_stocks=self.stocks)

        self.assertTrue(result["isSimulated"])
        self.assertEqual([item["cost"] for item in result["purchases"]], [12.51, 12.50])
        self.assertEqual(result["totalAllocated"], 25.01)
        self.assertEqual(result["remainingCash"], 0)

    def test_over_budget_model_plan_uses_the_fractional_fallback(self):
        with patch.object(ai_service, "_call_claude", return_value=(
            '{"reasoning":"Split the budget","purchases":['
            '{"ticker":"AAA","allocation":20},{"ticker":"BBB","allocation":10}]}'
        )):
            result = ai_service.suggest_buys(25, available_stocks=self.stocks)

        self.assertTrue(result["isSimulated"])
        self.assertEqual(result["totalAllocated"], 25)
        self.assertEqual(result["remainingCash"], 0)


if __name__ == "__main__":
    unittest.main()
