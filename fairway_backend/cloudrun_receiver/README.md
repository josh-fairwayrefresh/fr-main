# Fairway Cloud Run Receiver

This Cloud Run function receives PV4 button events from the nRF9151 firmware and stores them in Firestore.

## Current deployed service

Service name:

```text
fairway-button-receiver
https://fairway-button-receiver-936892386735.us-central1.run.app
```

## Fleet data foundation (`lib/fleet/`)

Internal-only backend modules implementing the canonical Customer -> Course -> Device schema and centralized `CUST-XXXX`/`COURSE-XXXX`/`FRB-XXXX` ID allocation. Not required by, and not wired into, `index.js`; intended for future Admin UI/API (WP3, WP4, WP5) code to import. See `docs/DEVICE_PROVISIONING_GUIDE.md` for the canonical data model.
