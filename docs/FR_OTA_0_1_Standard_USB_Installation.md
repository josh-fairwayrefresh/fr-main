# **Fairway Refresh — Standard OTA-0.1 USB Installation**

**Purpose:** Install the already-approved `OTA-0.1-r4` (`0.1.0+6`) package on one identified Fairway Refresh device and return it to authenticated service.

**Scope:** this is the separately authorized clean-installation/credential
commissioning path, not Version 6A. The
[Version 6A restart handoff](DEPLOYMENT_GUIDE.md#version-6a-field-deployment-suspension-and-restart-2026-11-15)
installs `OTA-1.0-r4` (`1.0.0+4`) on FRB-0001 without erase, provisioning or
credential changes. Do not substitute this algorithm for 6A or invoke it as an
automatic fallback. Installation evidence and subsequent CPO operational
validation must be reported separately.

**Execution rule:** Follow the sequence exactly. Do not substitute a storage-preserving flash, rebuild firmware, troubleshoot unrelated systems, or advance to successor OTA releases. If a step cannot be completed, **STOP**, leave the device in its current state, and report the step and observed failure. Never erase before Step 3 passes.

## **Fixed algorithm**

1. **AUTHENTICATION READINESS.** Before beginning installation, identify all Google Cloud, Firebase, and Fairway Refresh Admin authentication sessions required by the existing provisioning and credential activation workflow. Request the CPO to complete all necessary interactive logins at the beginning. Verify authenticated access to the required operations before proceeding. Never leave an authentication-dependent operation waiting silently. If authentication cannot be established, **STOP before erase**.
2. **SERVICE MODE.** For installed operational firmware, explicitly guide the CPO to disconnect VXX and USB, press and hold PV8 before applying USB power, and keep holding through boot. Wait for physical confirmation, positively associate the connected probe with the specified FRB device, and establish target access. Once Service Mode is latched and access confirmed, explicitly instruct PV8 release and wait for confirmation while USB remains connected. Do not infer readiness from probe enumeration alone or invent a fixed hold duration. The commissioner itself does not require PV8.
3. **PREPARE IDENTITY.** Retrieve the permanent device identity and established production provisioning record. Prepare the credential that will be installed (an existing recoverable credential or a replacement through the established credential lifecycle). Retain the provisioning material securely; do not expose secrets in logs or chat.
4. **VERIFY RESTORABILITY.** Confirm that all material and backend prerequisites needed to provision and activate that credential after erase are ready. If not, **STOP before erase**.
5. **ERASE.** Execute the established full-chip `probe-rs` erase on the verified target.
6. **FLASH.** Install the prebuilt, approved, production-signed `OTA-0.1-r4` package with its required boot components. Verify programming/read-back using the established tooling.
7. **PROVISION.** Restore the device’s permanent identity and provision the prepared credential using the established protected-storage mechanism. Activate the credential through the established production workflow if activation is required by that prepared credential.
8. **VERIFY.** Confirm firmware boots as `0.1.0+6` and the device successfully authenticates with production. Confirm the existing device registry identity, SIM association, and course assignment remain unchanged.
9. **REPORT.** Report **READY FOR FIELD POWER** only after Step 7 passes. Otherwise report **STOPPED — step, actual error, device state**.

**Not part of this operation:** assigning or installing `OTA-0.1alt-r4` or `OTA-1.0-r4`; changing assignments; creating or updating an `ota_capability` record (retired and inert); building firmware; changing backend or device architecture; modifying other devices; committing or pushing code.

**Authority:** Execute only on the device the CPO has authorized. This algorithm does not authorize a different device, new release, or unrelated production changes.
