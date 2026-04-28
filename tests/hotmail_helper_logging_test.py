import importlib.util
import io
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock


def load_hotmail_helper():
    module_path = Path(__file__).resolve().parents[1] / "scripts" / "hotmail_helper.py"
    spec = importlib.util.spec_from_file_location("hotmail_helper", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hotmail_helper = load_hotmail_helper()


class HotmailHelperLoggingTest(unittest.TestCase):
    def test_refresh_access_token_logs_invalid_grant_and_direct_connection_refused_separately(self):
        failures = [
            {
                "ok": False,
                "endpoint": "entra-common-delegated",
                "url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                "status": 400,
                "error": '{"error":"invalid_grant","error_description":"AADSTS70000"}',
                "elapsed_ms": 101,
            },
            {
                "ok": False,
                "endpoint": "entra-consumers-delegated",
                "url": "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
                "status": None,
                "error": "Token request failed: <urlopen error [Errno 61] Connection refused>",
                "elapsed_ms": 88,
            },
        ]

        with mock.patch.object(hotmail_helper, "try_refresh_access_token", side_effect=failures):
            output = io.StringIO()
            with redirect_stdout(output):
                with self.assertRaises(RuntimeError):
                    hotmail_helper.refresh_access_token(
                        "client-id-demo",
                        "refresh-token-demo",
                        ["entra-common-delegated", "entra-consumers-delegated"],
                    )

        rendered = output.getvalue()
        self.assertIn("category=invalid_grant", rendered)
        self.assertIn("category=connection_refused", rendered)

    def test_graph_and_outlook_message_urls_are_encoded(self):
        captured_urls = []

        def fake_get_json(url, headers=None):
            captured_urls.append(url)
            return 200, {"value": []}

        with mock.patch.object(hotmail_helper, "get_json", side_effect=fake_get_json):
            hotmail_helper.fetch_graph_messages("access-token-demo", mailbox="INBOX", top=5)
            hotmail_helper.fetch_outlook_api_messages("access-token-demo", mailbox="INBOX", top=5)

        self.assertEqual(len(captured_urls), 2)
        self.assertTrue(all(" " not in url for url in captured_urls))
        self.assertIn("%24orderby=receivedDateTime+desc", captured_urls[0])
        self.assertIn("%24orderby=ReceivedDateTime+desc", captured_urls[1])


if __name__ == "__main__":
    unittest.main()
