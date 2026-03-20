/**
 * Manual Jest mock for src/database.js
 *
 * Provides an in-memory implementation of every Mongoose model method used by
 * the routes so that the full Express HTTP stack can be tested without a live
 * MongoDB process.  Jest automatically picks this file up when a test calls
 * jest.mock('../src/database').
 */

const bcrypt = require('bcrypt');

// ── helpers ──────────────────────────────────────────────────────────────────

let _idSeq = 1;
function generateId() {
  return String(_idSeq++).padStart(24, '0');
}

function makeDoc(data) {
  const _id = String(data._id || generateId());
  const doc = { ...data, _id, id: _id };
  // Expose toJSON so route handlers can call doc.toJSON()
  doc.toJSON = function () {
    const { toJSON, ...rest } = this; // eslint-disable-line no-unused-vars
    return rest;
  };
  return doc;
}

/** Supports chaining .populate() .sort() .limit() .lean() before await. */
class QueryMock {
  constructor(value) {
    this._v = value;
  }
  populate() { return this; }
  sort() { return this; }
  limit(n) {
    if (Array.isArray(this._v)) this._v = this._v.slice(0, n);
    return this;
  }
  lean() { return this; }
  then(res, rej) { return Promise.resolve(this._v).then(res, rej); }
  catch(rej) { return Promise.resolve(this._v).catch(rej); }
}

function matchFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (k === '$or') {
      if (!v.some((f) => matchFilter(doc, f))) return false;
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v) && v.$regex !== undefined) {
      const re = new RegExp(v.$regex, v.$options || '');
      if (!re.test(String(doc[k] ?? ''))) return false;
    } else if (v === null) {
      if (doc[k] != null) return false;
    } else if (typeof v === 'boolean') {
      // Boolean fields may be undefined (schema would default them to true/false)
      const docVal = doc[k] === undefined ? true : doc[k];
      if (Boolean(docVal) !== v) return false;
    } else {
      if (String(doc[k]) !== String(v)) return false;
    }
  }
  return true;
}

/**
 * Create a mock model backed by an in-memory Map.
 * @param {Map}      store       - shared storage for this collection
 * @param {string[]} uniqueKeys  - fields that must be unique across documents
 * @param {object}   defaults    - default field values applied on create
 */
function createModel(store, uniqueKeys = [], defaults = {}) {
  function checkUnique(data, excludeId = null) {
    for (const key of uniqueKeys) {
      if (data[key] == null) continue;
      for (const [storedId, doc] of store.entries()) {
        if (excludeId && storedId === String(excludeId)) continue;
        if (String(doc[key]) === String(data[key])) {
          const err = new Error(`E11000 duplicate key error - ${key}`);
          err.code = 11000;
          throw err;
        }
      }
    }
  }

  return {
    _store: store,

    find(filter = {}) {
      const results = [...store.values()].filter((d) => matchFilter(d, filter));
      return new QueryMock(results);
    },

    findOne(filter = {}) {
      const result = [...store.values()].find((d) => matchFilter(d, filter)) || null;
      return Promise.resolve(result);
    },

    findById(id) {
      const result = store.get(String(id)) || null;
      return new QueryMock(result);
    },

    async create(data) {
      const full = { ...defaults, ...data };
      checkUnique(full);
      const doc = makeDoc({ ...full, created_at: new Date().toISOString() });
      store.set(doc.id, doc);
      return doc;
    },

    findByIdAndUpdate(id, update, opts = {}) {
      const existing = store.get(String(id));
      if (!existing) return new QueryMock(null);
      const setData = update.$set || update;
      checkUnique(setData, String(id));
      const updated = makeDoc({ ...existing, ...setData });
      store.set(updated.id, updated);
      return new QueryMock(opts.new !== false ? updated : existing);
    },

    async findByIdAndDelete(id) {
      const doc = store.get(String(id));
      if (doc) store.delete(String(id));
      return doc || null;
    },

    async deleteMany(filter = {}) {
      if (!filter || Object.keys(filter).length === 0) {
        store.clear();
      } else {
        for (const [id, doc] of store.entries()) {
          if (matchFilter(doc, filter)) store.delete(id);
        }
      }
    },

    async countDocuments(filter = {}) {
      if (!filter || Object.keys(filter).length === 0) return store.size;
      return [...store.values()].filter((d) => matchFilter(d, filter)).length;
    },

    async aggregate() {
      return [];
    },
  };
}

// ── Build stores & models (one instance per Jest worker / test file) ─────────

const userStore       = new Map();
const employeeStore   = new Map();
const mealPlanStore   = new Map();
const menuItemStore   = new Map();
const mealRecordStore = new Map();

const User     = createModel(userStore,     ['username']);
const Employee = createModel(employeeStore, ['employee_number', 'email', 'badge_number'], { active: true });
const MealPlan = createModel(mealPlanStore);
const MenuItem = createModel(menuItemStore);
const MealRecord = createModel(mealRecordStore);

// Enforce compound unique constraint: (employee_id, meal_type, consumption_date)
const _origMealRecordCreate = MealRecord.create.bind(MealRecord);
MealRecord.create = async function (data) {
  const dup = [...mealRecordStore.values()].find(
    (r) =>
      String(r.employee_id) === String(data.employee_id) &&
      r.meal_type === data.meal_type &&
      r.consumption_date === data.consumption_date
  );
  if (dup) {
    const err = new Error('E11000 duplicate key error');
    err.code = 11000;
    throw err;
  }
  return _origMealRecordCreate(data);
};

// ── Lifecycle helpers ─────────────────────────────────────────────────────────

async function initializeDatabase() {
  const existing = await User.findOne({ username: 'admin' });
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 10);
    await User.create({ username: 'admin', password: hashed, role: 'admin' });
  }
}

async function closeDatabase() { /* no-op for mock */ }

module.exports = { initializeDatabase, closeDatabase, User, Employee, MealPlan, MenuItem, MealRecord };
