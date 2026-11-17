import json
from pathlib import Path
import unittest

from prepare_reconstruction import render

BASELINE = Path(__file__).with_name("production-baseline-20261116-v2.json")


class ReconstructionTest(unittest.TestCase):
    def setUp(self):
        self.baseline = json.loads(BASELINE.read_text())
        self.project = "fairway-refresh-sandbox-dr"
        self.mappings = {"images": {}, "service_accounts": {}, "secrets": {},
                         "ota_bucket": self.project + "-ota",
                         "vapid_public_key": "synthetic-public-key"}
        for entry in self.baseline["cloud_run"].values():
            spec = entry["configuration"]["spec"]["template"]["spec"]
            self.mappings["service_accounts"][spec["serviceAccountName"]] = (
                "recovery-runtime@" + self.project + ".iam.gserviceaccount.com")
            for container in spec["containers"]:
                image = container["image"]
                self.mappings["images"][image] = (
                    "us-central1-docker.pkg.dev/" + self.project + "/recovery/runtime@sha256:"
                    + image.split("@sha256:")[1])
            for value in entry["environment_plan"]["secret_references"].values():
                name = value["secretKeyRef"]["name"]
                self.mappings["secrets"][name] = "isolated-" + name

    def test_remaps_every_production_target_and_stages_without_eventarc_or_public_iam(self):
        specs = render(self.baseline, self.project, self.mappings)
        self.assertEqual(len(specs), 3)
        serialized = json.dumps(specs)
        self.assertNotIn("savvy-kit-496703-r5", serialized)
        self.assertIn('"value": "sandbox"', serialized)
        self.assertIn('"run.googleapis.com/ingress": "internal"', serialized)
        self.assertNotIn("Eventarc", serialized)

    def test_rejects_existing_acceptance_sandbox_and_production_identity(self):
        with self.assertRaises(ValueError):
            render(self.baseline, "fairway-refresh-sandbox-260930", self.mappings)
        identity = next(iter(self.mappings["service_accounts"]))
        self.mappings["service_accounts"][identity] = identity
        with self.assertRaises(ValueError):
            render(self.baseline, self.project, self.mappings)

    def test_image_recovery_cannot_substitute_an_unverified_digest(self):
        image = next(iter(self.mappings["images"]))
        self.mappings["images"][image] = self.mappings["images"][image][:-1] + "z"
        with self.assertRaises(ValueError):
            render(self.baseline, self.project, self.mappings)
