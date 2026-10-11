'use strict';

/*
 * Minimal in-memory Firestore test double for the fairway_backend fleet
 * modules. Supports only the operations the fleet modules actually use
 * (document get/set/update, subcollections, add() with an auto ID,
 * where/limit queries with '==' and 'in', and an atomic batch). Intended
 * only for local unit testing; not a general Firestore emulator.
 */

class FakeQuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.empty = docs.length === 0;
    this.size = docs.length;
  }
}

class FakeDocSnapshot {
  constructor(db, path, value) {
    this.ref = new FakeDocRef(db, path);
    this.id = path.split('/').pop();
    this.exists = value !== undefined;
    this._value = value;
  }

  data() {
    return this._value;
  }

  get(field) {
    return this._value ? this._value[field] : undefined;
  }
}

function matchesFilter(data, filter) {
  const actual = data[filter.field];
  if (filter.op === '==') {
    return actual === filter.value;
  }
  if (filter.op === 'in') {
    return Array.isArray(filter.value) && filter.value.includes(actual);
  }
  if (filter.op === '>') {
    return actual > filter.value;
  }
  throw new Error(`Unsupported fake Firestore query operator: ${filter.op}`);
}

class FakeQuery {
  constructor(db, collectionPath, filters, limitCount, ordering) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.filters = filters || [];
    this.limitCount = limitCount || null;
    this.ordering = ordering || null;
  }

  where(field, op, value) {
    return new FakeQuery(this.db, this.collectionPath, [...this.filters, { field, op, value }], this.limitCount, this.ordering);
  }

  orderBy(field, direction = 'asc') {
    return new FakeQuery(this.db, this.collectionPath, this.filters, this.limitCount, { field, direction });
  }

  limit(count) {
    return new FakeQuery(this.db, this.collectionPath, this.filters, count, this.ordering);
  }

  async get() {
    const prefix = `${this.collectionPath}/`;
    const matches = [];

    for (const [path, value] of this.db._docs.entries()) {
      if (!path.startsWith(prefix)) {
        continue;
      }

      const remainder = path.slice(prefix.length);
      if (remainder.includes('/')) {
        continue; // only direct children of this collection, not nested subcollection docs
      }

      if (this.filters.every((filter) => matchesFilter(value, filter))) {
        matches.push(new FakeDocSnapshot(this.db, path, value));
      }

    }

    if (this.ordering) {
      const { field, direction } = this.ordering;
      matches.sort((left, right) => {
        const leftValue = left.data()[field];
        const rightValue = right.data()[field];
        const leftComparable = leftValue instanceof Date ? leftValue.getTime() : leftValue;
        const rightComparable = rightValue instanceof Date ? rightValue.getTime() : rightValue;
        const comparison = leftComparable < rightComparable ? -1 : leftComparable > rightComparable ? 1 : 0;
        return direction === 'desc' ? -comparison : comparison;
      });
    }

    return new FakeQuerySnapshot(this.limitCount ? matches.slice(0, this.limitCount) : matches);
  }
}

let autoIdCounter = 0;
function nextAutoId() {
  autoIdCounter += 1;
  return `auto-${autoIdCounter}`;
}

class FakeDocRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
    this.id = path.split('/').pop();
  }

  collection(name) {
    return new FakeCollectionRef(this.db, `${this.path}/${name}`);
  }

  async get() {
    return new FakeDocSnapshot(this.db, this.path, this.db._docs.get(this.path));
  }

  async set(data, options) {
    const opts = options || {};
    if (opts.merge) {
      const current = this.db._docs.get(this.path) || {};
      this.db._docs.set(this.path, { ...current, ...data });
    } else {
      this.db._docs.set(this.path, { ...data });
    }
  }

  async update(data) {
    if (!this.db._docs.has(this.path)) {
      throw new Error(`No document to update at ${this.path}`);
    }
    const current = this.db._docs.get(this.path);
    this.db._docs.set(this.path, { ...current, ...data });
  }
}

class FakeCollectionRef {
  constructor(db, path) {
    this.db = db;
    this.path = path;
  }

  doc(id) {
    return new FakeDocRef(this.db, `${this.path}/${id || nextAutoId()}`);
  }

  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }

  async get() {
    return new FakeQuery(this.db, this.path).get();
  }

  where(field, op, value) {
    return new FakeQuery(this.db, this.path, [{ field, op, value }]);
  }

  orderBy(field, direction) {
    return new FakeQuery(this.db, this.path).orderBy(field, direction);
  }

  limit(count) {
    return new FakeQuery(this.db, this.path, [], count);
  }
}

class FakeBatch {
  constructor(db) {
    this.db = db;
    this._ops = [];
  }

  set(ref, data, options) {
    this._ops.push({ ref, data, options: options || {} });
    return this;
  }

  update(ref, data) {
    this._ops.push({ ref, data, update: true });
    return this;
  }

  async commit() {
    for (const { ref, data, options, update } of this._ops) {
      // eslint-disable-next-line no-await-in-loop
      await (update ? ref.update(data) : ref.set(data, options));
    }
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.operations = [];
  }

  async get(ref) {
    if (this.operations.length > 0) {
      throw new Error('Fake transaction read after write');
    }
    return ref.get();
  }

  set(ref, data, options) {
    this.operations.push({ type: 'set', ref, data, options: options || {} });
    return this;
  }

  update(ref, data) {
    this.operations.push({ type: 'update', ref, data });
    return this;
  }

  delete(ref) {
    this.operations.push({ type: 'delete', ref });
    return this;
  }

  commit() {
    const nextDocs = new Map(this.db._docs);
    for (const operation of this.operations) {
      if (operation.type === 'delete') {
        nextDocs.delete(operation.ref.path);
      } else if (operation.type === 'update') {
        if (!nextDocs.has(operation.ref.path)) {
          throw new Error(`No document to update at ${operation.ref.path}`);
        }
        nextDocs.set(operation.ref.path, { ...nextDocs.get(operation.ref.path), ...operation.data });
      } else if (operation.options.merge) {
        nextDocs.set(operation.ref.path, { ...(nextDocs.get(operation.ref.path) || {}), ...operation.data });
      } else {
        nextDocs.set(operation.ref.path, { ...operation.data });
      }
    }
    this.db._docs = nextDocs;
    return this;
  }
}

class FakeFirestore {
  constructor() {
    this._docs = new Map();
    this._transactionTail = Promise.resolve();
    this.failNextTransactionCommit = false;
  }

  collection(name) {
    return new FakeCollectionRef(this, name);
  }

  batch() {
    return new FakeBatch(this);
  }

  async runTransaction(updateFunction) {
    const transactionRun = this._transactionTail.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await updateFunction(transaction);
      if (this.failNextTransactionCommit) {
        this.failNextTransactionCommit = false;
        throw new Error('Simulated transaction commit failure');
      }
      transaction.commit();
      return result;
    });
    this._transactionTail = transactionRun.catch(() => undefined);
    return transactionRun;
  }
}

module.exports = { FakeFirestore };
