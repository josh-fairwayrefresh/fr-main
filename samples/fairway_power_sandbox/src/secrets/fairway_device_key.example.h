#ifndef FAIRWAY_DEVICE_KEY_H
#define FAIRWAY_DEVICE_KEY_H

/* Per-device provisioning material: one physical unit's permanent canonical
 * identity and its unique credential, from a single provisioning source so
 * they can never be independently hardcoded in different locations. Replace
 * both placeholders with the values issued for this specific unit; never
 * reuse the same FAIRWAY_DEVICE_ID or FAIRWAY_DEVICE_KEY across devices.
 */
#define FAIRWAY_DEVICE_ID "REPLACE-WITH-DEVICE-ID"
#define FAIRWAY_DEVICE_KEY "replace-with-device-credential"

#endif /* FAIRWAY_DEVICE_KEY_H */
