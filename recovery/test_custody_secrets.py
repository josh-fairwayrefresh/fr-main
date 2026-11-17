import base64
import contextlib
import io
import unittest
from unittest.mock import patch

from custody_secrets import store


class CustodyTest(unittest.TestCase):
    def test_round_trip_verifies_bytes_without_logging_values(self):
        secret = b"synthetic-sensitive-value"
        responses = [
            {"name": "projects/independent/secrets/test/versions/1"},
            {"payload": {"data": base64.b64encode(secret).decode()}},
        ]
        output = io.StringIO()
        with patch("custody_secrets.call", side_effect=responses) as api:
            with contextlib.redirect_stdout(output):
                store("test", secret)
        self.assertEqual(api.call_count, 2)
        self.assertNotIn(secret.decode(), output.getvalue())
        self.assertIn("versions/1", output.getvalue())

    def test_mismatch_fails_without_success_output(self):
        responses = [
            {"name": "projects/independent/secrets/test/versions/1"},
            {"payload": {"data": base64.b64encode(b"wrong").decode()}},
        ]
        output = io.StringIO()
        with patch("custody_secrets.call", side_effect=responses):
            with contextlib.redirect_stdout(output):
                with self.assertRaisesRegex(RuntimeError, "read-back"):
                    store("test", b"expected")
        self.assertEqual(output.getvalue(), "")
