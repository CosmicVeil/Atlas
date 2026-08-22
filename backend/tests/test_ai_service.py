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


if __name__ == "__main__":
    unittest.main()
