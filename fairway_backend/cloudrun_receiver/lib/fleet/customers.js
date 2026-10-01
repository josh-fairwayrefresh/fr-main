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
 * Used by the authenticated WP5 admin API.
 */
async function createCustomer(db, { customerName, comments = null } = {}) {
  if (typeof customerName !== 'string' || customerName.trim().length === 0) {
    throw new Error('Customer name is required');
  }
  if (comments !== null && typeof comments !== 'string') {
    throw new Error('Customer comments must be a string or null');
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

async function updateCustomer(db, customerId, { customerName, comments } = {}) {
  const customerRef = db.collection(CUSTOMERS_COLLECTION).doc(customerId);
  const customerSnap = await customerRef.get();
  if (!customerSnap.exists) {
    throw new Error(`Unknown customer_id: ${customerId}`);
  }
  if (customerName !== undefined && (typeof customerName !== 'string' || customerName.trim().length === 0)) {
    throw new Error('Customer name is required');
  }
  if (comments !== undefined && comments !== null && typeof comments !== 'string') {
    throw new Error('Customer comments must be a string or null');
  }

  const updatedAt = new Date();
  const update = { updated_at: updatedAt };
  if (customerName !== undefined) {
    update.customer_name = customerName;
  }
  if (comments !== undefined) {
    update.comments = comments;
  }

  const batch = db.batch();
  batch.update(customerRef, update);

  if (customerName !== undefined) {
    const devicesSnap = await db.collection('devices').where('customer_id', '==', customerId).get();
    for (const deviceSnap of devicesSnap.docs) {
      batch.update(deviceSnap.ref, { customer_name: customerName, updated_at: updatedAt });
    }
  }

  await batch.commit();
  return { customer_id: customerId, ...customerSnap.data(), ...update };
}

module.exports = {
  CUSTOMERS_COLLECTION,
  createCustomer,
  getCustomer,
  updateCustomer,
};
