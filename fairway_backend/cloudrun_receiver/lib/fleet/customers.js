'use strict';

const { ID_PREFIXES } = require('./schema');
const { allocateNextId } = require('./ids');

const CUSTOMERS_COLLECTION = 'customers';

/*
 * Customer schema (minimum required fields only; no CRM/billing/contact
 * architecture is introduced here). The Firestore document ID is the
 * canonical CUST-XXXX identity; it is not duplicated as a customer_id field.
 *
 *   customer_name customer/contractual account name
 *   comments      administrator free-text notes
 *   created_at / updated_at   standard metadata
 */

/*
 * Creates a Customer document with a centrally allocated CUST-XXXX id.
 * Intended for future Admin UI (WP5) use; not wired into any exposed route.
 */
async function createCustomer(db, { customerName, comments = null } = {}) {
  if (!customerName || typeof customerName !== 'string') {
    throw new Error('Customer name is required');
  }

  const customerId = await allocateNextId(db, ID_PREFIXES.CUSTOMER);
  const now = new Date();

  const customerDoc = {
    customer_name: customerName,
    comments,
    created_at: now,
    updated_at: now,
  };

  await db.collection(CUSTOMERS_COLLECTION).doc(customerId).set(customerDoc);

  return { customer_id: customerId, ...customerDoc };
}

/*
 * Looks up a Customer by ID. Used by devices.js to source the authoritative
 * customer_name display copy when assigning a device.
 */
async function getCustomer(db, customerId) {
  const customerSnap = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();

  if (!customerSnap.exists) {
    return null;
  }

  return { customer_id: customerId, ...customerSnap.data() };
}

module.exports = {
  CUSTOMERS_COLLECTION,
  createCustomer,
  getCustomer,
};
