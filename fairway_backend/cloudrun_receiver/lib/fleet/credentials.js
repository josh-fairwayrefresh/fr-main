'use strict';

const crypto = require('crypto');

/*
 * Pure, Firestore-independent per-device credential generation and
 * verification primitives. The plaintext credential is a high-entropy random
 * bearer token, not a human password; only a non-reversible SHA-256 verifier
 * is ever returned for persistence. No new dependency is used, only Node's
 * built-in `crypto` module.
 */

const CREDENTIAL_BYTE_LENGTH = 32;
const CREDENTIAL_ENCODING = 'base64url';
const VERIFIER_ALGORITHM = 'sha256';

function computeDigest(secret) {
  return crypto.createHash(VERIFIER_ALGORITHM).update(secret, 'utf8').digest('hex');
}

/*
 * Derives the storable verifier for an already-generated plaintext secret.
 * Never returns or logs the secret itself.
 */
function deriveCredentialVerifier(secret) {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('secret is required to derive a credential verifier');
  }

  return {
    algorithm: VERIFIER_ALGORITHM,
    digest: computeDigest(secret),
    updated_at: new Date(),
  };
}

/*
 * Generates a new 256-bit random device credential. Returns the plaintext
 * secret (to be delivered exactly once to the caller for local provisioning)
 * alongside the verifier that is safe to persist. The plaintext is never
 * logged or persisted by this function.
 */
function generateDeviceCredential() {
  const secret = crypto.randomBytes(CREDENTIAL_BYTE_LENGTH).toString(CREDENTIAL_ENCODING);

  return {
    secret,
    verifier: deriveCredentialVerifier(secret),
  };
}

/*
 * Verifies a presented plaintext secret against a device's stored verifier.
 * Safely rejects (returns false, never throws) missing/malformed input,
 * unknown algorithms, or corrupt stored verifiers. Uses a constant-time
 * comparison over fixed-length digests to avoid timing side-channels; digest
 * length is fixed by the algorithm and is not attacker-influenced per
 * request, so a length mismatch (only possible with a corrupt stored
 * verifier) is treated as an immediate verification failure.
 */
function verifyDeviceCredential(secret, storedVerifier) {
  if (typeof secret !== 'string' || secret.length === 0) {
    return false;
  }
  if (!storedVerifier || typeof storedVerifier !== 'object') {
    return false;
  }
  if (storedVerifier.algorithm !== VERIFIER_ALGORITHM) {
    return false;
  }
  if (typeof storedVerifier.digest !== 'string') {
    return false;
  }

  let presentedDigest;
  let storedDigestBuffer;
  let presentedDigestBuffer;

  try {
    presentedDigest = computeDigest(secret);
    storedDigestBuffer = Buffer.from(storedVerifier.digest, 'hex');
    presentedDigestBuffer = Buffer.from(presentedDigest, 'hex');
  } catch (_err) {
    return false;
  }

  if (storedDigestBuffer.length !== presentedDigestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedDigestBuffer, presentedDigestBuffer);
}

module.exports = {
  CREDENTIAL_BYTE_LENGTH,
  CREDENTIAL_ENCODING,
  VERIFIER_ALGORITHM,
  generateDeviceCredential,
  deriveCredentialVerifier,
  verifyDeviceCredential,
};
