#!/usr/bin/env python3
"""Read-only, value-redacted comparison of an isolated managed restore."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import ssl
import subprocess
import sys
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

PROJECT = "savvy-kit-496703-r5"
SOURCE = "(default)"
ROOTS = ("customers", "requests", "user_access", "qr_bays")
# Credential, subscription and command collections are deliberately out of scope.
EXCLUDED = frozenset({
    "devices", "device_credential_rotations", "device_credential_rotation_secrets",
    "device_credential_rotation_locks", "course_push_subscriptions",
    "notification_dispatches", "commands",
})


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def field_hash(document):
    prefix = f"projects/{PROJECT}/databases/"
    databases = (SOURCE, document["name"].split("/databases/")[1].split("/")[0])

    def normalize(value):
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if isinstance(value, dict):
            result = {key: normalize(item) for key, item in value.items()}
            if isinstance(result.get("referenceValue"), str):
                for database in databases:
                    old = f"{prefix}{database}/documents/"
                    if result["referenceValue"].startswith(old):
                        result["referenceValue"] = "documents/" + result["referenceValue"][len(old):]
            return result
        return value

    fields = json.dumps(normalize(document.get("fields", {})),
                        sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(fields.encode()).hexdigest()


def compare(source, recovered, snapshot_time):
    boundary = timestamp(snapshot_time)
    verified = Counter()
    uncertain = Counter()
    mismatches = Counter()
    historical = []
    for path in sorted(source.keys() | recovered.keys()):
        original, restored = source.get(path), recovered.get(path)
        group = path.split("/")[0] if "/" not in path else "/".join(path.split("/")[::2])
        if original is not None and timestamp(original["updateTime"]) <= boundary:
            if restored is None or field_hash(original) != field_hash(restored):
                mismatches[group] += 1
            else:
                verified[group] += 1
                historical.append(original.get("createTime", original["updateTime"]))
        elif restored is not None:
            # A post-snapshot update/delete cannot be compared to the old value.
            uncertain[group] += 1
    return {
        "source_documents_at_comparison_time": len(source),
        "restored_documents": len(recovered),
        "verified_unchanged_snapshot_documents": sum(verified.values()),
        "verified_by_collection_path": dict(sorted(verified.items())),
        "unverifiable_changed_or_deleted": dict(sorted(uncertain.items())),
        "mismatches": dict(sorted(mismatches.items())),
        "oldest_verified_creation_time": min(historical, key=timestamp) if historical else None,
        "newest_verified_creation_time": max(historical, key=timestamp) if historical else None,
    }


class Reader:
    def __init__(self, token, project=PROJECT):
        self.token = token
        self.project = project
        self.context = ssl.create_default_context(cafile="/etc/ssl/cert.pem")

    def request(self, path, body=None, query=None):
        url = f"https://firestore.googleapis.com/v1/{path}"
        if query:
            url += "?" + urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        request = Request(url, data=data, headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
            "X-Goog-User-Project": self.project,
        })
        try:
            with urlopen(request, context=self.context, timeout=120) as response:
                return json.load(response)
        except HTTPError as error:
            raise RuntimeError(f"Firestore read failed: HTTP {error.code}") from None

    def tree(self, database, read_time):
        base = f"projects/{self.project}/databases/{database}/documents"
        result = {}

        def child_collections(document):
            ids = []
            child_page = None
            while True:
                body = {"pageSize": 1000, "readTime": read_time}
                if child_page:
                    body["pageToken"] = child_page
                children = self.request(document["name"] + ":listCollectionIds", body)
                ids.extend(children.get("collectionIds", []))
                child_page = children.get("nextPageToken")
                if not child_page:
                    return document["name"], ids

        def walk(parent, collection):
            if collection in EXCLUDED:
                return
            page = None
            while True:
                query = {"pageSize": 1000, "showMissing": "true", "readTime": read_time}
                if page:
                    query["pageToken"] = page
                response = self.request(f"{parent}/{quote(collection, safe='')}", query=query)
                documents = response.get("documents", [])
                for document in documents:
                    if "updateTime" in document:
                        result[document["name"].split("/documents/", 1)[1]] = document
                for name, ids in pool.map(child_collections, documents):
                    for child in ids:
                        walk(name, child)
                page = response.get("nextPageToken")
                if not page:
                    break

        with ThreadPoolExecutor(max_workers=8) as pool:
            for root in ROOTS:
                walk(base, root)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-database", required=True)
    parser.add_argument("--snapshot-time", required=True)
    parser.add_argument("--source-read-time", required=True,
                        help="PITR whole minute at/after snapshot; changed records are reported unverified")
    args = parser.parse_args()
    if not args.recovery_database.startswith("recovery-verify-") or "/" in args.recovery_database:
        parser.error("destination must be an explicitly named recovery-verify-* database")
    if timestamp(args.source_read_time) < timestamp(args.snapshot_time):
        parser.error("comparison time must not precede the snapshot")
    if timestamp(args.source_read_time).second or timestamp(args.source_read_time).microsecond:
        parser.error("source PITR comparison time must be a whole minute")
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    reader = Reader(token)
    database = reader.request(f"projects/{PROJECT}/databases/{args.recovery_database}")
    info = database.get("sourceInfo", {})
    if info.get("progress") != "COMPLETED" or info.get("backup", {}).get("snapshotTime") != args.snapshot_time:
        raise RuntimeError("Restore is incomplete or snapshot identity differs")
    recovered_time = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    source = reader.tree(SOURCE, args.source_read_time)
    recovered = reader.tree(args.recovery_database, recovered_time)
    report = compare(source, recovered, args.snapshot_time)
    report.update({
        "source_database": SOURCE, "recovery_database": args.recovery_database,
        "backup_snapshot_time": args.snapshot_time, "source_comparison_time": args.source_read_time,
        "scope": list(ROOTS), "excluded_collection_ids": sorted(EXCLUDED),
        "production_writes": 0, "recovery_writes": 0,
    })
    print(json.dumps(report, indent=2))
    if report["mismatches"] or not report["verified_unchanged_snapshot_documents"]:
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as error:
        print(f"Restore verification failed: {error}; no data changed.", file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # Never emit response bodies or document fields.
        print(f"Restore verification failed ({type(error).__name__}); no data changed.", file=sys.stderr)
        sys.exit(1)
