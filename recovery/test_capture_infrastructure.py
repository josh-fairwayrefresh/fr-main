import unittest

from capture_infrastructure import environment_plan


class ConfigurationCaptureTest(unittest.TestCase):
    def test_secret_values_are_not_selected_as_public(self):
        plan = environment_plan([{"env": [
            {"name": "FAIRWAY_ENV"},
            {"name": "FAIRWAY_QR_RATE_KEY"},
            {"name": "FAIRWAY_VAPID_PRIVATE_KEY", "valueFrom": {
                "secretKeyRef": {"name": "fairway-vapid-private-key", "key": "1"}}},
        ]}])
        self.assertEqual(plan["nonsecret_value_names"], ["FAIRWAY_ENV"])
        self.assertEqual(plan["unresolved_custody_names"], ["FAIRWAY_QR_RATE_KEY"])
        self.assertEqual(plan["secret_references"]["FAIRWAY_VAPID_PRIVATE_KEY"],
                         {"secretKeyRef": {"name": "fairway-vapid-private-key", "key": "1"}})


if __name__ == "__main__":
    unittest.main()
