#!/usr/bin/env python3
"""Render native recovery provisioning requests for review; never execute them."""
import argparse
import json
from pathlib import Path
import re

PRODUCTION = "savvy-kit-496703-r5"
GENERAL_SANDBOX = "fairway-refresh-sandbox-260930"
REGION = "us-central1"


def build_plan(project, image, notification_channel):
    if (project == PRODUCTION or project.startswith("fairway-refresh-sandbox-")
            or not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project)):
        raise ValueError("An approved independent recovery project is required")
    if not re.fullmatch(
            rf"us-central1-docker\.pkg\.dev/{re.escape(project)}/[^ ]+@sha256:[0-9a-f]{{64}}",
            image):
        raise ValueError("Job image must be digest-pinned in the recovery project")
    if not re.fullmatch(
            rf"projects/{re.escape(project)}/notificationChannels/[0-9]+",
            notification_channel):
        raise ValueError("An approved recovery-project notification channel is required")
    exports = f"{project}-exports"
    artifacts = f"{project}-accepted-artifacts"
    worker = f"digital-recovery@{project}.iam.gserviceaccount.com"
    scheduler = f"recovery-scheduler@{project}.iam.gserviceaccount.com"
    commands = []

    def command(gate, *args):
        commands.append({"approval_gate": gate, "argv": ["gcloud", *args, f"--project={project}"]})

    command("recovery_resources", "services", "enable", "run.googleapis.com",
            "cloudscheduler.googleapis.com", "monitoring.googleapis.com",
            "logging.googleapis.com", "artifactregistry.googleapis.com",
            "secretmanager.googleapis.com", "iam.googleapis.com")
    for bucket in (exports, artifacts):
        command("recovery_resources", "storage", "buckets", "create", f"gs://{bucket}",
                "--location=US", "--uniform-bucket-level-access",
                "--public-access-prevention")
    command("recovery_resources", "storage", "buckets", "update", f"gs://{exports}",
            "--lifecycle-file=exports-lifecycle.json")
    for account in ("digital-recovery", "recovery-scheduler"):
        command("recovery_resources", "iam", "service-accounts", "create", account)
    command("recovery_resources", "iam", "roles", "create", "recoveryObjectWriter",
            "--title=Recovery Object Writer",
            "--permissions=storage.buckets.get,storage.objects.create,storage.objects.get",
            "--stage=GA")
    command("recovery_resources", "storage", "buckets", "add-iam-policy-binding",
            f"gs://{exports}", f"--member=serviceAccount:{worker}",
            f"--role=projects/{project}/roles/recoveryObjectWriter")
    command("cross_project_export_access", "iam", "roles", "create",
            "nativeFirestoreRecoveryWriter", "--title=Native Firestore Recovery Writer",
            "--permissions=storage.buckets.get,storage.objects.create,storage.objects.get,storage.objects.list",
            "--stage=GA")
    command("cross_project_export_access", "storage", "buckets", "add-iam-policy-binding",
            f"gs://{exports}",
            "--member=serviceAccount:service-936892386735@gcp-sa-firestore.iam.gserviceaccount.com",
            f"--role=projects/{project}/roles/nativeFirestoreRecoveryWriter",
            "--condition=title=FirestoreExportsOnly,expression="
            f'resource.name == "projects/_/buckets/{exports}" || '
            f'resource.name.startsWith("projects/_/buckets/{exports}/objects/firestore/")')
    command("sensitive_auth_custody", "secrets", "create", "recovery-auth-scrypt",
            "--replication-policy=automatic")
    command("sensitive_auth_custody", "secrets", "add-iam-policy-binding",
            "recovery-auth-scrypt", f"--member=serviceAccount:{worker}",
            "--role=roles/secretmanager.secretAccessor")
    activation = []
    environments = {}
    absence_conditions = []
    for action in ("firestore", "auth"):
        job = f"digital-recovery-{action}"
        config = {
            "allowCloudOperations": False,
            "authorizeProductionFirestoreExport": False,
            "authorizeProductionAuthExport": False,
            "sourceProject": PRODUCTION, "sourceProjectNumber": "936892386735",
            "recoveryProject": project,
            "recoveryProjectNumber": "REPLACE_WITH_VERIFIED_PROJECT_NUMBER",
            "bucket": exports,
        }
        environment = {"RECOVERY_ACTION": action, "RECOVERY_CONFIG_JSON": json.dumps(config)}
        secret_args = []
        if action == "auth":
            environment["RECOVERY_AUTH_HASH_CONFIG_FILE"] = "/recovery-secrets/hash-config.json"
            secret_args = ["--set-secrets=/recovery-secrets/hash-config.json=recovery-auth-scrypt:1"]
        environments[f"{action}-environment.json"] = environment
        command("recovery_resources" if action == "firestore" else "sensitive_auth_custody",
                "run", "jobs", "create", job,
                f"--region={REGION}", f"--image={image}", f"--service-account={worker}",
                "--tasks=1", "--parallelism=1", "--max-retries=1", "--task-timeout=14400s",
                "--cpu=1", "--memory=512Mi", f"--env-vars-file={action}-environment.json",
                *secret_args)
        command("recovery_resources", "run", "jobs", "add-iam-policy-binding",
                job, f"--region={REGION}",
                f"--member=serviceAccount:{scheduler}", "--role=roles/run.invoker")
        command("activation_after_verified_first_run", "scheduler", "jobs", "create", "http",
                f"{job}-daily", f"--location={REGION}", "--schedule=0 9 * * *",
                "--time-zone=Etc/UTC", "--http-method=POST",
                f"--uri=https://run.googleapis.com/v2/projects/{project}/locations/{REGION}/jobs/{job}:run",
                f"--oauth-service-account-email={scheduler}",
                "--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform",
                "--attempt-deadline=180s", "--message-body={}",
                "--headers=Content-Type=application/json",
                "--max-retry-attempts=3", "--min-backoff=60s", "--max-backoff=300s")
        activation.append(commands.pop())
        absence_conditions.append({
            "displayName": f"No successful {action} recovery in 26 hours",
            "conditionThreshold": {
                "filter": 'resource.type="cloud_run_job" AND '
                          f'resource.labels.job_name="{job}" AND '
                          'metric.type="logging.googleapis.com/user/digital_recovery_success"',
                "comparison": "COMPARISON_LT", "thresholdValue": 1,
                "duration": "3600s",
                "evaluationMissingData": "EVALUATION_MISSING_DATA_ACTIVE",
                "aggregations": [{"alignmentPeriod": "90000s",
                                   "perSeriesAligner": "ALIGN_SUM"}]},
        })
    command("recovery_resources", "logging", "metrics", "create", "digital_recovery_success",
            '--log-filter=resource.type="cloud_run_job" AND '
            'resource.labels.job_name=~"^digital-recovery-(firestore|auth)$" AND '
            'jsonPayload.event="recovery_succeeded"')
    return {
        "status": "REVIEW_ONLY_NOT_EXECUTED",
        "project_must_preexist": project,
        "no_project_creation_no_resource_deletion": True,
        "commands": commands,
        "activation_commands": activation,
        "environment_files_default_disabled": environments,
        "production_access_commands": [
            {"approval_gate": "production_export_only_iam", "argv": [
                "gcloud", "iam", "roles", "create", "digitalRecoveryExport",
                "--title=Digital Recovery Export",
                "--permissions=datastore.databases.export,datastore.databases.getMetadata,datastore.operations.get",
                "--stage=GA", f"--project={PRODUCTION}"]},
            {"approval_gate": "production_export_only_iam", "argv": [
                "gcloud", "projects", "add-iam-policy-binding", PRODUCTION,
                f"--member=serviceAccount:{worker}",
                f"--role=projects/{PRODUCTION}/roles/digitalRecoveryExport",
                f"--project={PRODUCTION}"]},
            {"approval_gate": "sensitive_auth_access", "argv": [
                "gcloud", "iam", "roles", "create", "digitalRecoveryAuthExport",
                "--title=Digital Recovery Auth Export",
                "--permissions=firebaseauth.users.get,firebaseauth.configs.get,firebaseauth.configs.getHashConfig,identitytoolkit.tenants.list",
                "--stage=GA", f"--project={PRODUCTION}"]},
            {"approval_gate": "sensitive_auth_access", "argv": [
                "gcloud", "projects", "add-iam-policy-binding", PRODUCTION,
                f"--member=serviceAccount:{worker}",
                f"--role=projects/{PRODUCTION}/roles/digitalRecoveryAuthExport",
                f"--project={PRODUCTION}"]},
        ],
        "exports-lifecycle.json": {"rule": [{"action": {"type": "Delete"},
                                           "condition": {"age": 30}}]},
        "failure-alert.json": {
            "displayName": "Digital recovery export failure", "combiner": "OR",
            "notificationChannels": [notification_channel],
            "alertStrategy": {"notificationRateLimit": {"period": "3600s"},
                              "autoClose": "604800s"},
            "conditions": [{"displayName": "Recovery job error",
                            "conditionMatchedLog": {
                                "filter": 'resource.type="cloud_run_job" AND '
                                          'resource.labels.job_name=~"^digital-recovery-(firestore|auth)$" '
                                          'AND severity>=ERROR'}}],
        },
        "missing-success-alert.json": {
            "displayName": "Digital recovery daily success missing", "combiner": "OR",
            "notificationChannels": [notification_channel],
            "conditions": absence_conditions,
        },
        "required_separate_authorizations": [
            "Recovery project/billing and restricted administrator ownership.",
            "Review and execute recovery-resource commands, image build/publication and alert creation.",
            "Production export-only IAM and sensitive Auth/hash export permissions; no import permission.",
            "Sensitive Auth export and separate credential custody; leave runtime authorization disabled.",
            "Verify Firestore service-agent identity before granting cross-project bucket access.",
            "First successful run, failure notification test, then create the daily schedule.",
        ],
        "limitations": [
            "No commands or alert policies were applied. Verify recovery project number and enable only the approved per-action runtime gates after approval.",
            "Hash-config Secret Manager version1 must be separately custodied and source-matched before Auth job creation; change the pin explicitly if needed.",
            "No retention lock. Lifecycle age30 plus provider soft-delete grace; do not expire OTA artifacts.",
            "Firestore service-agent export writer cannot delete objects or alter IAM; verify required native permissions on first authorized export.",
            "Missing-success alert requires an initial successful metric stream; inspect first scheduled run.",
            "Alert JSON requires native Monitoring alertPolicies.create in recovery project after approval.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recovery-project", required=True)
    parser.add_argument("--job-image", required=True)
    parser.add_argument("--notification-channel", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build_plan(args.recovery_project, args.job_image, args.notification_channel)
    with args.output.open("x") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
