'use strict';

class OperationalStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 503;
  }
}

function mode() {
  const value = process.env.FAIRWAY_OPERATIONAL_STORAGE || 'customer';
  if (!['legacy', 'customer'].includes(value)) {
    throw new OperationalStorageError('invalid_storage_mode', 'Invalid operational storage configuration');
  }
  return value;
}

function parent(db, customerId) {
  return db.collection('customers').doc(customerId);
}

function inventoryRef(db, customerId, assetId) {
  return parent(db, customerId).collection(mode() === 'customer' ? 'assets' : 'courses').doc(assetId);
}

function serviceRef(db, customerId, serviceId) {
  return parent(db, customerId).collection(mode() === 'customer' ? 'services' : 'courses').doc(serviceId);
}

async function assertOwner(db, customerId, transaction) {
  const ref = parent(db, customerId);
  const snapshot = await (transaction ? transaction.get(ref) : ref.get());
  const state = snapshot.data()?.operational_storage?.state || 'legacy';
  if (!snapshot.exists || state !== mode()) {
    throw new OperationalStorageError('operational_storage_unavailable',
      `Customer operations are unavailable in ${mode()} mode (${state})`);
  }
}

module.exports = { OperationalStorageError, assertOwner, inventoryRef, mode, serviceRef };
