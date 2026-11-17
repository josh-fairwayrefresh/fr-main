import unittest

from verify_firestore_restore import Reader, compare


def document(database="(default)", value=1, updated="2026-11-16T08:00:00Z"):
    return {
        "name": f"projects/savvy-kit-496703-r5/databases/{database}/documents/customers/C",
        "fields": {"value": {"integerValue": str(value)}},
        "createTime": "2026-05-01T00:00:00Z", "updateTime": updated,
    }


class RestoreComparisonTest(unittest.TestCase):
    def test_exact_value_comparison_does_not_depend_on_restored_update_time(self):
        result = compare({"customers/C": document()}, {
            "customers/C": document("recovery-verify-test", updated="2026-11-16T10:00:00Z")
        }, "2026-11-16T09:00:00Z")
        self.assertEqual(result["verified_unchanged_snapshot_documents"], 1)
        self.assertEqual(result["mismatches"], {})

    def test_lost_or_changed_nested_history_fails(self):
        for recovered in ({}, {"customers/C/courses/A/sales/S": document(value=2)}):
            result = compare({"customers/C/courses/A/sales/S": document()}, recovered,
                             "2026-11-16T09:00:00Z")
            self.assertEqual(result["mismatches"], {"customers/courses/sales": 1})

    def test_post_snapshot_changes_and_deletes_are_not_claimed_verified(self):
        result = compare({"customers/C": document(updated="2026-11-16T09:01:00Z")}, {
            "customers/C": document("recovery-verify-test"), "customers/deleted": document()
        }, "2026-11-16T09:00:00Z")
        self.assertEqual(result["verified_unchanged_snapshot_documents"], 0)
        self.assertEqual(result["unverifiable_changed_or_deleted"], {"customers": 2})

    def test_new_post_snapshot_document_is_not_a_lost_backup_record(self):
        result = compare({"customers/new": document(updated="2026-11-16T09:01:00Z")},
                         {}, "2026-11-16T09:00:00Z")
        self.assertEqual(result["mismatches"], {})

    def test_database_reference_names_are_normalized(self):
        original = document()
        recovered = document("recovery-verify-test")
        for item, database in ((original, "(default)"), (recovered, "recovery-verify-test")):
            item["fields"]["ref"] = {"referenceValue":
                f"projects/savvy-kit-496703-r5/databases/{database}/documents/customers/C"}
        self.assertEqual(compare({"customers/C": original}, {"customers/C": recovered},
                                 "2026-11-16T09:00:00Z")["mismatches"], {})

    def test_string_values_are_not_rewritten_like_database_references(self):
        original, recovered = document(), document("recovery-verify-test")
        for item, database in ((original, "(default)"), (recovered, "recovery-verify-test")):
            item["fields"]["text"] = {"stringValue":
                f"projects/savvy-kit-496703-r5/databases/{database}/documents/customers/C"}
        self.assertEqual(compare({"customers/C": original}, {"customers/C": recovered},
                                 "2026-11-16T09:00:00Z")["mismatches"], {"customers": 1})

    def test_enumerates_below_missing_parents_without_reading_excluded_credentials(self):
        parent = document()["name"]
        old = document()
        old["name"] = parent + "/history/old"

        class FakeReader(Reader):
            def __init__(self):
                self.project = "savvy-kit-496703-r5"

            def request(self, path, body=None, query=None):
                if path == parent.rsplit("/", 1)[0]:
                    return {"documents": [{"name": parent}]}
                if path == parent + ":listCollectionIds":
                    return {"collectionIds": ["history", "devices"]}
                if path == parent + "/history":
                    return {"documents": [old]}
                if path == parent + "/devices":
                    raise AssertionError("Credential documents must not be read")
                return {}

        result = FakeReader().tree("(default)", "2026-11-16T09:00:00Z")
        self.assertEqual(list(result), ["customers/C/history/old"])


if __name__ == "__main__":
    unittest.main()
