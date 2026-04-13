import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from hotmail_helper import find_new_code_from_cache_delta, select_latest_usable_code


class SelectLatestUsableCodeTests(unittest.TestCase):
    def test_prefers_newest_message_after_threshold(self):
        messages = [
            {
                "id": "old",
                "subject": "Your verification code is 111111",
                "bodyPreview": "111111",
                "body": "111111",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 1000,
            },
            {
                "id": "new",
                "subject": "Your verification code is 222222",
                "bodyPreview": "222222",
                "body": "222222",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 3000,
            },
        ]

        selected = select_latest_usable_code(
            messages,
            sender_filters=["openai", "noreply"],
            subject_filters=["verification", "code"],
            exclude_codes=[],
            filter_after_timestamp=2000,
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["code"], "222222")
        self.assertEqual(selected["message"]["id"], "new")

    def test_skips_excluded_code_and_uses_next_newest(self):
        messages = [
            {
                "id": "latest",
                "subject": "Verification code 333333",
                "bodyPreview": "333333",
                "body": "333333",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 5000,
            },
            {
                "id": "fallback",
                "subject": "Verification code 444444",
                "bodyPreview": "444444",
                "body": "444444",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 4000,
            },
        ]

        selected = select_latest_usable_code(
            messages,
            sender_filters=["openai"],
            subject_filters=["verification", "code"],
            exclude_codes=["333333"],
            filter_after_timestamp=0,
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["code"], "444444")
        self.assertEqual(selected["message"]["id"], "fallback")

    def test_rejects_older_message_when_only_older_message_exists(self):
        messages = [
            {
                "id": "old-only",
                "subject": "Verification code 555555",
                "bodyPreview": "555555",
                "body": "555555",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 1000,
            },
        ]

        selected = select_latest_usable_code(
            messages,
            sender_filters=["openai"],
            subject_filters=["verification", "code"],
            exclude_codes=[],
            filter_after_timestamp=2000,
        )

        self.assertIsNone(selected)

    def test_rejects_latest_older_code_when_threshold_misses(self):
        messages = [
            {
                "id": "latest-old",
                "subject": "你的 OpenAI 代码为 676227",
                "bodyPreview": "676227",
                "body": "676227",
                "from": {"emailAddress": {"address": "noreply@tm.openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 1000,
            },
            {
                "id": "older",
                "subject": "你的 ChatGPT 代码为 453690",
                "bodyPreview": "453690",
                "body": "453690",
                "from": {"emailAddress": {"address": "noreply@tm.openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 900,
            },
        ]

        selected = select_latest_usable_code(
            messages,
            sender_filters=["openai", "noreply"],
            subject_filters=["verification", "code", "openai", "chatgpt"],
            exclude_codes=[],
            filter_after_timestamp=2000,
        )

        self.assertIsNone(selected)

    def test_matches_openai_cn_subject_like_original_project(self):
        messages = [
            {
                "id": "cn-openai",
                "subject": "你的 OpenAI 代码为 676227",
                "bodyPreview": "",
                "body": "",
                "from": {"emailAddress": {"address": "noreply@tm.openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 5000,
            },
            {
                "id": "textnow",
                "subject": "Your verification code is 420603.",
                "bodyPreview": "",
                "body": "",
                "from": {"emailAddress": {"address": "noreply@notify.textnow.com", "name": "TextNow"}},
                "receivedTimestamp": 4000,
            },
        ]

        selected = select_latest_usable_code(
            messages,
            sender_filters=["openai", "noreply", "verify", "auth", "duckduckgo", "forward"],
            subject_filters=["verify", "verification", "code", "confirm"],
            exclude_codes=[],
            filter_after_timestamp=0,
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["code"], "676227")
        self.assertEqual(selected["message"]["id"], "cn-openai")

    def test_prefers_new_uncached_message_after_start_timestamp(self):
        messages = [
            {
                "id": "cached-mail",
                "subject": "Your verification code is 111111",
                "bodyPreview": "111111",
                "body": "111111",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 5000,
                "mailbox": "INBOX",
            },
            {
                "id": "fresh-mail",
                "subject": "Your verification code is 222222",
                "bodyPreview": "222222",
                "body": "222222",
                "from": {"emailAddress": {"address": "noreply@openai.com", "name": "OpenAI"}},
                "receivedTimestamp": 9000,
                "mailbox": "INBOX",
            },
        ]

        selected = find_new_code_from_cache_delta(
            messages,
            cached_signatures={"INBOX|cached-mail|5000|Your verification code is 111111|noreply@openai.com"},
            exclude_codes=[],
            start_timestamp=7000,
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected["code"], "222222")
        self.assertEqual(selected["message"]["id"], "fresh-mail")


if __name__ == "__main__":
    unittest.main()
