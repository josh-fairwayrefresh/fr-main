"""Authenticated native API calls with response bodies excluded from errors."""
import json
import ssl
import subprocess
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def call(url, body=None, method=None, project="fairway-refresh-recovery", raw=False):
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"],
                                    text=True).strip()
    headers = {"Authorization": "Bearer " + token, "X-Goog-User-Project": project,
               "Content-Type": "application/json"}
    payload = (json.dumps(body).encode() if body is not None else None)
    request = Request(url, data=payload, headers=headers, method=method)
    try:
        with urlopen(request, context=ssl.create_default_context(cafile="/etc/ssl/cert.pem"),
                     timeout=120) as response:
            data = response.read()
            return data if raw else json.loads(data or b"{}")
    except HTTPError as error:
        try:
            status = json.loads(error.read()).get("error", {}).get("status", "UNKNOWN")
        except (ValueError, KeyError):
            status = "UNKNOWN"
        raise RuntimeError(f"Native API request failed: HTTP {error.code}, {status}") from None
