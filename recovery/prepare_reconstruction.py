#!/usr/bin/env python3
"""Render isolated Cloud Run recovery specifications, without cloud mutations."""
import argparse
import copy
import json
from pathlib import Path
import re

PRODUCTION = "savvy-kit-496703-r5"


def render(baseline, project, mappings):
    if (not re.fullmatch(r"fairway-refresh-sandbox-[a-z0-9-]+", project)
            or len(project) > 30 or project == "fairway-refresh-sandbox-260930"):
        raise ValueError("Rehearsal needs a separate sandbox-prefix project, not the CPO sandbox")
    specifications = {}
    for name, entry in baseline["cloud_run"].items():
        if entry["environment_plan"]["unresolved_custody_names"]:
            raise ValueError(f"Unresolved environment custody: {name}")
        source = entry["configuration"]
        template = copy.deepcopy(source["spec"]["template"])
        spec = template["spec"]
        identity = mappings["service_accounts"][spec["serviceAccountName"]]
        if not identity.endswith(f"@{project}.iam.gserviceaccount.com"):
            raise ValueError("Rehearsal identity must belong to the isolated target")
        spec["serviceAccountName"] = identity
        for container in spec["containers"]:
            original = container["image"]
            image = mappings["images"][original]
            if (not image.startswith(f"us-central1-docker.pkg.dev/{project}/")
                    or "@sha256:" not in image
                    or image.split("@sha256:")[1] != original.split("@sha256:")[1]):
                raise ValueError("Copy the exact deployed image digest into the isolated project")
            container["image"] = image
            public = dict(entry["nonsecret_environment"])
            public.update(FAIRWAY_ENV="sandbox", FAIRWAY_GCP_PROJECT=project,
                          GOOGLE_CLOUD_PROJECT=project, FAIRWAY_OTA_DELIVERY_ENABLED="false",
                          FAIRWAY_OTA_BUCKET=mappings["ota_bucket"], FAIRWAY_QR_ENABLED="false")
            if "FAIRWAY_VAPID_SUBJECT" in public:
                public["FAIRWAY_VAPID_SUBJECT"] = f"https://{project}.web.app"
            if "FAIRWAY_VAPID_PUBLIC_KEY" in public:
                public["FAIRWAY_VAPID_PUBLIC_KEY"] = mappings["vapid_public_key"]
            if name == "fairway-admin":
                public["FAIRWAY_ALLOWED_ORIGIN"] = f"https://{project}.web.app"
            else:
                public.pop("FAIRWAY_ALLOWED_ORIGIN", None)
            env = [{"name": key, "value": value} for key, value in sorted(public.items())]
            for key, value in entry["environment_plan"]["secret_references"].items():
                reference = value["secretKeyRef"]
                secret = mappings["secrets"][reference["name"]]
                if not re.fullmatch(r"[a-zA-Z0-9_-]+", secret):
                    raise ValueError("Use isolated-project secret names, not cross-project paths")
                env.append({"name": key, "valueFrom": {"secretKeyRef": {
                    "name": secret, "key": reference["key"]}}})
            container["env"] = env
        template["metadata"] = {"annotations": {
            "autoscaling.knative.dev/maxScale": "1"}}
        specifications[name] = {
            "apiVersion": "serving.knative.dev/v1", "kind": "Service",
            "metadata": {"name": name, "annotations": {"run.googleapis.com/ingress": "internal"}},
            "spec": {"template": template},
        }
    if PRODUCTION in json.dumps(specifications):
        raise ValueError("Unresolved production reference in rehearsal specification")
    if not mappings["ota_bucket"].startswith(project + "-"):
        raise ValueError("OTA bucket must be explicitly isolated")
    return specifications


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--target-project", required=True)
    parser.add_argument("--mappings", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    args = parser.parse_args()
    result = render(json.loads(args.baseline.read_text()), args.target_project,
                    json.loads(args.mappings.read_text()))
    args.output_directory.mkdir(parents=True, exist_ok=False)
    for name, spec in result.items():
        (args.output_directory / f"{name}.json").write_text(json.dumps(spec, indent=2) + "\n")
    print("Rendered isolated service specifications; no resources or IAM changed.")


if __name__ == "__main__":
    main()
