'use strict';

const { formatId, ID_PREFIXES } = require('./schema');

const COUNTER_COLLECTION = 'counters';

/*
 * Reserved starting sequence number per ID prefix, applied only when a
 * counter document does not yet exist (first-ever allocation for that
 * prefix). Customer and Course have no reservation and start at 1
 * (CUST-0001, COURSE-0001). Device starts at 2 because the existing
 * physical reference device is canonically reserved as FRB-0001; that
 * reservation is a documentation/allocation-floor fact only (see
 * docs/DEVICE_PROVISIONING_GUIDE.md) and is never written as a live
 * Firestore counter document by this module. This keeps the reservation
 * centralized in one place rather than special-cased across callers.
 */
const RESERVED_FLOORS = Object.freeze({
  [ID_PREFIXES.DEVICE]: 2,
});

/*
 * Atomically allocates the next sequential ID for `prefix` (one of
 * ID_PREFIXES.{CUSTOMER,COURSE,DEVICE}) using a Firestore transaction against
 * counters/{prefix}. Firestore transactions serialize contended reads/writes
 * and automatically retry on conflict, so concurrent future Admin "Add
 * Customer/Course/Device" calls cannot allocate the same ID twice, and no
 * client ever guesses or supplies the sequence number itself.
 */
async function allocateNextId(db, prefix) {
  const counterRef = db.collection(COUNTER_COLLECTION).doc(prefix);
  const initialFloor = RESERVED_FLOORS[prefix] || 1;

  const nextSequence = await db.runTransaction(async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const current = counterSnap.exists ? counterSnap.data().next || initialFloor : initialFloor;

    transaction.set(counterRef, { next: current + 1 }, { merge: true });

    return current;
  });

  return formatId(prefix, nextSequence);
}

module.exports = {
  COUNTER_COLLECTION,
  RESERVED_FLOORS,
  allocateNextId,
};
