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
  constructor(path, value) {
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
  throw new Error(`Unsupported fake Firestore query operator: ${filter.op}`);
}

class FakeQuery {
  constructor(db, collectionPath, filters, limitCount) {
    this.db = db;
    this.collectionPath = collectionPath;
    this.filters = filters || [];
    this.limitCount = limitCount || null;
  }

  where(field, op, value) {
    return new FakeQuery(this.db, this.collectionPath, [...this.filters, { field, op, value }], this.limitCount);
  }

  limit(count) {
    return new FakeQuery(this.db, this.collectionPath, this.filters, count);
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
        matches.push(new FakeDocSnapshot(path, value));
      }

      if (this.limitCount && matches.length >= this.limitCount) {
        break;
      }
    }

    return new FakeQuerySnapshot(matches);
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
    return new FakeDocSnapshot(this.path, this.db._docs.get(this.path));
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

  where(field, op, value) {
    return new FakeQuery(this.db, this.path, [{ field, op, value }]);
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

  async commit() {
    for (const { ref, data, options } of this._ops) {
      // eslint-disable-next-line no-await-in-loop
      await ref.set(data, options);
    }
  }
}

/*
 * Minimal fake transaction: this in-memory double has no real concurrent
 * writers, so no optimistic-retry logic is needed. `get`/`set`/`update`
 * simply delegate straight to the referenced FakeDocRef; FakeDocRef's own
 * operations already complete synchronously before returning their
 * resolved Promise, so callers that call transaction.set()/update()
 * without awaiting (as the real Firestore transaction API allows) still
 * observe the write immediately, matching allocateNextId()'s usage.
 */
class FakeTransaction {
  async get(ref) {
    return ref.get();
  }

  set(ref, data, options) {
    ref.set(data, options);
    return this;
  }

  update(ref, data) {
    ref.update(data);
    return this;
  }
}

class FakeFirestore {
  constructor() {
    this._docs = new Map();
  }

  collection(name) {
    return new FakeCollectionRef(this, name);
  }

  batch() {
    return new FakeBatch(this);
  }

  async runTransaction(updateFunction) {
    return updateFunction(new FakeTransaction());
  }
}

module.exports = { FakeFirestore };
