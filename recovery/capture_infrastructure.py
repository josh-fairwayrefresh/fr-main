#!/usr/bin/env python3
"""Capture nonsecret recovery configuration; never access secret versions."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

PROJECT = "savvy-kit-496703-r5"
REGION = "us-central1"
SERVICES = ("fairway-admin", "fairway-button-receiver", "fairway-request-notifier")
PUBLIC_ENV = frozenset({
    "FAIRWAY_ENV", "FAIRWAY_SERVICE_MODE", "FAIRWAY_GCP_PROJECT",
    "GOOGLE_CLOUD_PROJECT", "FAIRWAY_ALLOWED_ORIGIN", "FAIRWAY_VAPID_PUBLIC_KEY",
    "FAIRWAY_VAPID_KEY_VERSION", "FAIRWAY_OTA_BUCKET", "FAIRWAY_OTA_DELIVERY_ENABLED",
    "FAIRWAY_OPERATIONAL_STORAGE", "FAIRWAY_PUBLIC_ANONYMOUS_REVIEW",
    "DEPLOY_TIMESTAMP", "FUNCTION_TARGET", "FUNCTION_SIGNATURE_TYPE",
    "LOG_EXECUTION_ID", "FAIRWAY_QR_ENABLED", "FAIRWAY_VAPID_SUBJECT",
})
RUN_FIELDS = (
    "metadata.name,metadata.annotations,spec.template.metadata.annotations,spec.template.metadata.name,"
    "spec.template.spec.serviceAccountName,spec.template.spec.timeoutSeconds,"
    "spec.template.spec.containerConcurrency,spec.template.spec.containers[].image,"
    "spec.template.spec.containers[].resources,spec.template.spec.containers[].ports,"
    "spec.template.spec.containers[].env[].name,"
    "spec.template.spec.containers[].env[].valueFrom,status.traffic,status.url"
)


def gcloud(*args, fields=None):
    command = ["gcloud", *args, f"--project={PROJECT}",
               f"--format=json({fields})" if fields else "--format=json"]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"Configuration capture failed: {' '.join(args[:3])}")
    return json.loads(result.stdout)


def environment_plan(containers):
    names = {item["name"] for container in containers for item in container.get("env", [])}
    references = {
        item["name"]: item["valueFrom"] for container in containers
        for item in container.get("env", []) if "valueFrom" in item
    }
    return {
        "nonsecret_value_names": sorted(names & PUBLIC_ENV),
        "secret_references": references,
        "unresolved_custody_names": sorted(names - PUBLIC_ENV - references.keys()),
    }


def capture():
    root = Path(__file__).resolve().parents[1]
    services = {}
    for service in SERVICES:
        configuration = gcloud("run", "services", "describe", service,
                               f"--region={REGION}", fields=RUN_FIELDS)
        serving = [item["revisionName"] for item in configuration["status"]["traffic"]
                   if item.get("percent") == 100]
        if (len(serving) != 1
                or configuration["spec"]["template"]["metadata"]["name"] != serving[0]):
            raise RuntimeError(f"Capture requires one serving revision matching the template: {service}")
        containers = configuration["spec"]["template"]["spec"]["containers"]
        if len(containers) != 1:
            raise RuntimeError(f"Review multi-container recovery capture explicitly: {service}")
        revision = gcloud("run", "revisions", "describe", serving[0], f"--region={REGION}",
                          fields="metadata.name,status.imageDigest")
        containers[0]["image"] = revision["status"]["imageDigest"]
        plan = environment_plan(containers)
        public = {}
        allowed = " OR ".join(f"spec.template.spec.containers.env.name={name}"
                              for name in plan["nonsecret_value_names"])
        if allowed:
            rows = gcloud("run", "services", "list", f"--region={REGION}",
                          "--flatten=spec.template.spec.containers[].env[]",
                          f"--filter=metadata.name={service} AND ({allowed})",
                          fields="spec.template.spec.containers.env")
            for row in rows:
                env = row["spec"]["template"]["spec"]["containers"]["env"]
                if env["name"] in PUBLIC_ENV and "value" in env:
                    public[env["name"]] = env["value"]
        services[service] = {
            "configuration": configuration, "environment_plan": plan,
            "nonsecret_environment": public,
            "invoker_policy": gcloud("run", "services", "get-iam-policy", service,
                                     f"--region={REGION}"),
        }
    files = [
        "fairway_webapp/cart_operator_dashboard/firebase.json",
        "fairway_webapp/cart_operator_dashboard/firestore.rules",
        "fairway_webapp/cart_operator_dashboard/firestore.indexes.json",
        "fairway_backend/cloudrun_receiver/package-lock.json",
        "fairway_webapp/cart_operator_dashboard/package-lock.json",
    ]
    return {
        "schema_version": 1, "captured_at": datetime.now(timezone.utc).isoformat(),
        "source_project": PROJECT, "region": REGION,
        "source_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root,
                                                text=True).strip(),
        "cloud_run": services,
        "enabled_apis": gcloud("services", "list", "--enabled", fields="config.name"),
        "project_iam": gcloud("projects", "get-iam-policy", PROJECT),
        "service_accounts": gcloud("iam", "service-accounts", "list",
                                   fields="email,disabled,displayName"),
        "eventarc": gcloud("eventarc", "triggers", "list", "--location=-"),
        "ota_storage": gcloud("storage", "buckets", "describe",
                              f"gs://{PROJECT}-ota-artifacts"),
        "ota_storage_iam": gcloud("storage", "buckets", "get-iam-policy",
                                  f"gs://{PROJECT}-ota-artifacts"),
        "secret_metadata_only": gcloud("secrets", "list", fields="name,replication,labels"),
        "firestore": gcloud("firestore", "databases", "describe", "--database=(default)"),
        "backup_schedules": gcloud("firestore", "backups", "schedules", "list",
                                   "--database=(default)"),
        "tracked_file_sha256": {file: hashlib.sha256((root / file).read_bytes()).hexdigest()
                                for file in files},
        "not_captured": [
            "Secret values and Firebase Auth/hash configuration (separate authorization)",
            "Firebase provider/domain console settings and DNS registrar custody",
            "Live Firestore Security Rules source versus tracked candidate must be reconciled",
            "Exact Hosting artifact, release config and build source archives need independent custody",
            "Custom IAM role definitions and service-account impersonation policies need reconciliation",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output already exists; preserve the previous capture")
    data = capture()
    with args.output.open("x", encoding="utf-8") as file:
        json.dump(data, file, indent=2, sort_keys=True)
        file.write("\n")
    print("Nonsecret infrastructure capture completed; inspect unresolved custody before reconstruction.")


if __name__ == "__main__":
    main()
