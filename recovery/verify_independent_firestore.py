#!/usr/bin/env python3
"""Compare scoped historical records from an isolated independent export import."""
import argparse
from datetime import datetime, timezone
import json
import subprocess
from verify_firestore_restore import Reader, compare, ROOTS, PROJECT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-project", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--operation", required=True)
    parser.add_argument("--export-prefix", required=True)
    parser.add_argument("--snapshot-time", required=True)
    args = parser.parse_args()
    if (args.recovery_project == PROJECT
            or args.recovery_project.startswith("fairway-refresh-sandbox-")
            or not args.database.startswith("recovery-import-")
            or "/" in args.database):
        parser.error("Use an isolated independent recovery project and named recovery-import database")
    prefix = f"projects/{args.recovery_project}/databases/{args.database}/operations/"
    if not args.operation.startswith(prefix):
        parser.error("Import operation must belong to the isolated destination")
    if not args.export_prefix.startswith(f"gs://{args.recovery_project}-exports/firestore/"):
        parser.error("Export must originate in the independent export bucket")
    token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
    recovered_reader = Reader(token, args.recovery_project)
    operation = recovered_reader.request(args.operation)
    metadata = operation.get("metadata", {})
    if (operation.get("done") is not True or operation.get("error")
            or metadata.get("operationState") != "SUCCESSFUL"
            or metadata.get("inputUriPrefix") != args.export_prefix):
        raise RuntimeError("Independent import is incomplete or export identity differs")
    source = Reader(token).tree("(default)", args.snapshot_time)
    restored = recovered_reader.tree(args.database, datetime.now(timezone.utc).isoformat())
    report = compare(source, restored, args.snapshot_time)
    report.update({
        "source_project": PROJECT, "recovery_project": args.recovery_project,
        "recovery_database": args.database, "snapshot_time": args.snapshot_time,
        "import_operation": args.operation, "import_metadata": metadata,
        "scope": list(ROOTS), "production_writes": 0,
    })
    print(json.dumps(report, indent=2))
    return int(bool(report["mismatches"] or report["unverifiable_changed_or_deleted"]
                    or not report["verified_unchanged_snapshot_documents"]))


if __name__ == "__main__":
    raise SystemExit(main())
