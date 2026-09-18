'use strict';

const { ID_PREFIXES } = require('./schema');
const { allocateNextId } = require('./ids');

const CUSTOMERS_COLLECTION = 'customers';

/*
 * Customer schema (minimum required fields only; no CRM/billing/contact
 * architecture is introduced here):
 *
 *   customer_id   permanent CUST-XXXX identity
 *   name          customer/contractual account name
 *   comments      administrator free-text notes
 *   created_at / updated_at   standard metadata
 */

/*
 * Creates a Customer document with a centrally allocated CUST-XXXX id.
 * Intended for future Admin UI (WP5) use; not wired into any exposed route.
 */
async function createCustomer(db, { name, comments = null } = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('Customer name is required');
  }

  const customerId = await allocateNextId(db, ID_PREFIXES.CUSTOMER);
  const now = new Date();

  const customerDoc = {
    customer_id: customerId,
    name,
    comments,
    created_at: now,
    updated_at: now,
  };

  await db.collection(CUSTOMERS_COLLECTION).doc(customerId).set(customerDoc);

  return customerDoc;
}

module.exports = {
  CUSTOMERS_COLLECTION,
  createCustomer,
};
