# Fairway Cloud Run Receiver

This Cloud Run function receives PV4 button events from the nRF9151 firmware and stores them in Firestore.

## Current deployed service

Service name:

```text
fairway-button-receiver
https://fairway-button-receiver-936892386735.us-central1.run.app
```

## Fleet data foundation (`lib/fleet/`)

Backend modules implementing the canonical Customer -> Course -> Device schema,
centralized `CUST-XXXX`/`COURSE-XXXX`/`FRB-XXXX` ID allocation, state-derived
communication permission, location-derived request metadata, and per-device
credential generation/verification. The live request-ingestion path in
`index.js` uses the schema and per-device authentication helpers. Customer,
Course, Device administration primitives remain internal for future Admin UI/API
work. See `docs/DEVICE_PROVISIONING_GUIDE.md` for the canonical data model.
