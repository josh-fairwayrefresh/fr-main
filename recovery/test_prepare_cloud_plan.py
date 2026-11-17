import json
import unittest

from prepare_cloud_plan import build_plan


class CloudPlanTest(unittest.TestCase):
    def plan(self, project="fairway-refresh-recovery"):
        return build_plan(project, f"us-central1-docker.pkg.dev/{project}/jobs/export@sha256:"
                          + "a" * 64, f"projects/{project}/notificationChannels/123")

    def test_isolated_and_inactive_by_default(self):
        plan = self.plan()
        commands = plan["commands"]
        self.assertTrue(all(c["argv"][-1] == "--project=fairway-refresh-recovery"
                            for c in commands))
        self.assertFalse(any("scheduler" in c["argv"] for c in commands))
        self.assertEqual(len(plan["activation_commands"]), 2)
        scheduler = plan["activation_commands"][0]
        self.assertEqual(scheduler["approval_gate"], "activation_after_verified_first_run")
        self.assertFalse(any("delete" in c["argv"] for c in commands))
        self.assertFalse(any("retention-lock" in str(c) for c in commands))
        self.assertEqual(plan["exports-lifecycle.json"]["rule"][0]["condition"]["age"], 30)

    def test_both_export_actions_are_wired_with_explicit_disabled_authorization(self):
        plan = self.plan()
        for action in ("auth", "firestore"):
            env = plan["environment_files_default_disabled"][f"{action}-environment.json"]
            self.assertEqual(env["RECOVERY_ACTION"], action)
            config = json.loads(env["RECOVERY_CONFIG_JSON"])
            self.assertFalse(config["allowCloudOperations"])
            self.assertFalse(config["authorizeProductionAuthExport"])
            self.assertFalse(config["authorizeProductionFirestoreExport"])
            self.assertNotIn("snapshotTime", config)
            job = next(c["argv"] for c in plan["commands"]
                       if "create" in c["argv"] and f"digital-recovery-{action}" in c["argv"])
            self.assertIn(f"--env-vars-file={action}-environment.json", job)
        conditions = plan["missing-success-alert.json"]["conditions"]
        self.assertEqual(len(conditions), 2)
        threshold = conditions[1]["conditionThreshold"]
        self.assertIn('job_name="digital-recovery-auth"', threshold["filter"])
        self.assertEqual(int(threshold["duration"][:-1])
                         + int(threshold["aggregations"][0]["alignmentPeriod"][:-1]), 26 * 3600)
        self.assertEqual(threshold["evaluationMissingData"], "EVALUATION_MISSING_DATA_ACTIVE")

    def test_refuses_production_and_general_acceptance_sandbox(self):
        for project in ("savvy-kit-496703-r5", "fairway-refresh-sandbox-260930"):
            with self.assertRaises(ValueError):
                self.plan(project)

    def test_digest_and_alert_recipient_are_required(self):
        with self.assertRaises(ValueError):
            build_plan("fairway-refresh-recovery", "image:latest",
                       "projects/fairway-refresh-recovery/notificationChannels/123")
        with self.assertRaises(ValueError):
            build_plan("fairway-refresh-recovery",
                       "us-central1-docker.pkg.dev/fairway-refresh-recovery/jobs/export@sha256:"
                       + "a" * 64, "unapproved-email")

    def test_source_agent_cannot_read_auth_exports_or_delete_retained_objects(self):
        plan = self.plan()
        grant = next(c["argv"] for c in plan["commands"]
                     if any("FirestoreExportsOnly" in arg for arg in c["argv"]))
        self.assertIn("/objects/firestore/", " ".join(grant))
        writer = next(c["argv"] for c in plan["commands"]
                      if "nativeFirestoreRecoveryWriter" in c["argv"])
        self.assertNotIn("storage.objects.delete", " ".join(writer))
        self.assertNotIn("storage.buckets.setIamPolicy", " ".join(writer))
        source = str(plan["production_access_commands"])
        self.assertNotIn("datastore.databases.import", source)
        self.assertNotIn("firebaseauth.users.update", source)
