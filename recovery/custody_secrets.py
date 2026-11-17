#!/usr/bin/env python3
"""Transfer authorized recovery material directly between native APIs in memory."""
import base64
import argparse
import json

from cloud_api import call

SOURCE = "savvy-kit-496703-r5"
TARGET = "fairway-refresh-recovery"


def store(name, value):
    endpoint = f"https://secretmanager.googleapis.com/v1/projects/{TARGET}/secrets/{name}"
    result = call(endpoint + ":addVersion", {
        "payload": {"data": base64.b64encode(value).decode("ascii")}})
    recovered = call("https://secretmanager.googleapis.com/v1/" + result["name"] + ":access")
    if base64.b64decode(recovered["payload"]["data"]) != value:
        raise RuntimeError("Independent custody value failed read-back verification")
    print(json.dumps({"custody_secret_version": result["name"]}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorize-sensitive-custody", action="store_true")
    args = parser.parse_args()
    if not args.authorize_sensitive_custody:
        parser.error("Explicit sensitive custody authority is required; this creates new secret versions")
    config = call(f"https://identitytoolkit.googleapis.com/admin/v2/projects/{SOURCE}/config",
                  project=SOURCE)
    original = config["signIn"]["hashConfig"]
    if original["algorithm"] != "SCRYPT" or not original.get("signerKey"):
        raise RuntimeError("Source native SCRYPT configuration unavailable")
    normalized = {key: original[key] for key in ("algorithm", "saltSeparator", "rounds", "memoryCost")}
    normalized["key"] = original["signerKey"]
    store("recovery-auth-scrypt", json.dumps(normalized).encode())
    store("recovery-auth-project-config", json.dumps(config).encode())
    for name in ("fairway-qr-rate-key", "fairway-vapid-private-key", "fairway-vapid-public-key"):
        result = call(
            f"https://secretmanager.googleapis.com/v1/projects/{SOURCE}/secrets/{name}/versions/latest:access",
            project=SOURCE)
        store("custody-" + name, base64.b64decode(result["payload"]["data"]))
    print("Custody transfers completed in memory; no secret values written locally or logged.")


if __name__ == "__main__":
    main()
