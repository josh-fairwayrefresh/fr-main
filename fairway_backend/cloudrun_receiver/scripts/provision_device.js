#!/usr/bin/env node
'use strict';

/*
 * Bounded, reusable CLI for provisioning exactly one new Fairway Refresh
 * device through the existing canonical fleet primitives
 * (lib/fleet/provisioning.js -> createDevice() / replaceDeviceCredential()).
 * Duplicates no fleet business logic; this is a thin invocation surface.
 *
 * Prints the allocated Device ID and one-time plaintext credential to
 * STDOUT only, for the operator to paste directly into that unit's local
 * gitignored samples/fairway_power_sandbox/src/secrets/fairway_device_key.h.
 * Never writes the plaintext to a file, log, or any other location itself,
 * and never persists it anywhere beyond the single Firestore verifier
 * already written by replaceDeviceCredential().
 *
 * Leaves the device in its initial state (default in_inventory); deployment
 * state transition is a separate, later commissioning step
 * (updateDeviceState), intentionally not performed here.
 *
 * New-device provisioning:
 *   node scripts/provision_device.js \
 *     --sim 89464278206108309162 \
 *     [--comments "..."]
 *
 * Partial-provisioning recovery (device already created, credential issuance
 * previously failed): issues/replaces the credential for that exact,
 * already-existing device_id WITHOUT calling createDevice() again, so a
 * second Device can never be allocated by using this path:
 *   node scripts/provision_device.js --issue-credential-for FRB-0002
 *
 * Requires production Google Cloud credentials/project context (Application
 * Default Credentials) to reach live Firestore; not invoked by this task.
 */

const { Firestore } = require('@google-cloud/firestore');
const {
  provisionNewDevice,
  issueCredentialForExistingDevice,
  ProvisioningError,
} = require('../lib/fleet/provisioning');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    args[token.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

function printUsage() {
  console.error(
    'Usage: node scripts/provision_device.js [--sim ICCID] [--comments "..."]'
  );
  console.error(
    '   or: node scripts/provision_device.js --issue-credential-for FRB-XXXX   '
    + '(partial-provisioning recovery; does not call createDevice())'
  );
}

function printCredentialForPaste(result) {
  console.log(`Device ID: ${result.deviceId}`);
  console.log('');
  console.log('Paste the following into samples/fairway_power_sandbox/src/secrets/fairway_device_key.h');
  console.log('(that file is gitignored; never commit it):');
  console.log('');
  console.log(`#define FAIRWAY_DEVICE_ID "${result.deviceId}"`);
  console.log(`#define FAIRWAY_DEVICE_KEY "${result.plaintextCredential}"`);
  console.log('');
  console.log('This plaintext credential is shown exactly once and is not stored anywhere else.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = new Firestore();

  if (args['issue-credential-for']) {
    let result;
    try {
      result = await issueCredentialForExistingDevice(db, args['issue-credential-for']);
    } catch (error) {
      console.error(`CREDENTIAL RECOVERY FAILED: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    console.log('Credential recovery succeeded. No new Device was created.');
    printCredentialForPaste(result);
    return;
  }

  let result;
  try {
    result = await provisionNewDevice(db, {
      simIccid: args.sim || null,
      comments: args.comments || null,
    });
  } catch (error) {
    if (error instanceof ProvisioningError) {
      console.error(`PROVISIONING FAILED: ${error.message}`);
    } else {
      console.error(`PROVISIONING FAILED (unexpected error): ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Provisioning succeeded.');
  console.log('Hardware and firmware identity require verified provisioning records.');
  printCredentialForPaste(result);
  console.log('Device state is "in_inventory" and completely unassigned; deploy separately after commissioning.');
}

main().catch((error) => {
  console.error('PROVISIONING FAILED (unhandled error):', error);
  process.exitCode = 1;
});
