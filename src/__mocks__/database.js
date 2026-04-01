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

function toComparableValue(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate) && typeof value === 'string' && value.includes('T')) {
    return parsedDate;
  }

  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && String(value).trim() !== '') {
    return asNumber;
  }

  return String(value ?? '');
}

function matchFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (k === '$or') {
      if (!v.some((f) => matchFilter(doc, f))) return false;
    } else if (k === '$expr') {
      continue;
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if (v.$regex !== undefined) {
        const re = new RegExp(v.$regex, v.$options || '');
        if (!re.test(String(doc[k] ?? ''))) return false;
        continue;
      }

      if (v.$in !== undefined) {
        if (!Array.isArray(v.$in)) return false;
        if (!v.$in.some((item) => String(item) === String(doc[k]))) return false;
      }

      if (v.$gt !== undefined) {
        if (!(toComparableValue(doc[k]) > toComparableValue(v.$gt))) return false;
      }

      if (v.$gte !== undefined) {
        if (!(toComparableValue(doc[k]) >= toComparableValue(v.$gte))) return false;
      }

      if (v.$lte !== undefined) {
        if (!(toComparableValue(doc[k]) <= toComparableValue(v.$lte))) return false;
      }
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

  function toPlainDoc(data) {
    const { save, toJSON, ...rest } = data;
    return rest;
  }

  function hydrate(data) {
    const doc = makeDoc(data);
    doc.save = async function save() {
      const next = toPlainDoc(this);
      checkUnique(next, this.id);
      const persisted = hydrate(next);
      store.set(persisted.id, persisted);
      return persisted;
    };
    return doc;
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
      const resolvedDefaults = Object.fromEntries(
        Object.entries(defaults).map(([key, value]) => [key, typeof value === 'function' ? value() : value])
      );
      const full = { ...resolvedDefaults, ...data };
      checkUnique(full);
      const doc = hydrate({ ...full, created_at: new Date().toISOString() });
      store.set(doc.id, doc);
      return doc;
    },

    findByIdAndUpdate(id, update, opts = {}) {
      const existing = store.get(String(id));
      if (!existing) return new QueryMock(null);
      const setData = update.$set || update;
      checkUnique(setData, String(id));
      const updated = hydrate({ ...existing, ...setData });
      store.set(updated.id, updated);
      return new QueryMock(opts.new !== false ? updated : existing);
    },

    findOneAndUpdate(filter, update, opts = {}) {
      let existing = [...store.values()].find((d) => matchFilter(d, filter)) || null;

      if (!existing && opts.upsert) {
        const insertData = {
          ...defaults,
          ...Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith('$') && typeof v !== 'object')),
          ...(update.$setOnInsert || {})
        };
        checkUnique(insertData);
        existing = hydrate({ ...insertData, created_at: new Date().toISOString() });
        store.set(existing.id, existing);
      }

      if (!existing) {
        return Promise.resolve(null);
      }

      if (filter.$expr && filter.$expr.$lt) {
        const [left, right] = filter.$expr.$lt;
        const leftKey = String(left).replace('$', '');
        const rightKey = String(right).replace('$', '');
        if (!((existing[leftKey] || 0) < (existing[rightKey] || 0))) {
          return Promise.resolve(null);
        }
      }

      const next = { ...existing };
      if (update.$set) {
        Object.assign(next, update.$set);
      }
      if (update.$inc) {
        for (const [k, v] of Object.entries(update.$inc)) {
          next[k] = Number(next[k] || 0) + Number(v);
        }
      }
      checkUnique(next, existing.id);
      const updated = hydrate(next);
      store.set(updated.id, updated);
      return Promise.resolve(opts.new === false ? existing : updated);
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
const workerCategoryStore = new Map();
const vendorStore = new Map();
const vendorRestrictionStore = new Map();
const entitlementPolicyStore = new Map();
const workerEntitlementBalanceStore = new Map();
const transactionStore = new Map();
const reconciliationRecordStore = new Map();
const qrTokenMetadataStore = new Map();
const auditLogStore = new Map();

const User     = createModel(userStore,     ['username'], { role: 'viewer' });
const Employee = createModel(employeeStore, ['worker_identifier', 'employee_number', 'email', 'badge_number'], { active: true, status: 'active' });
const Worker = Employee;
const MealPlan = createModel(mealPlanStore);
const MenuItem = createModel(menuItemStore);
const MealRecord = createModel(mealRecordStore, [], {
  status: 'used',
  canteen_location: 'Main Canteen',
  consumed_at: () => new Date()
});
const WorkerCategory = createModel(workerCategoryStore, ['code']);
const Vendor = createModel(vendorStore, ['code']);
const VendorRestriction = createModel(vendorRestrictionStore);
const EntitlementPolicy = createModel(entitlementPolicyStore);
const WorkerEntitlementBalance = createModel(workerEntitlementBalanceStore);
const Transaction = createModel(transactionStore, ['transaction_reference']);
const ReconciliationRecord = createModel(reconciliationRecordStore);
const QRTokenMetadata = createModel(qrTokenMetadataStore, ['token_jti']);
const AuditLog = createModel(auditLogStore);

// Enforce compound unique constraint: (employee_id, meal_type, consumption_date)
const _origMealRecordCreate = MealRecord.create.bind(MealRecord);
MealRecord.create = async function (data) {
  const payload = { ...data };
  if (!payload.vendor_user_id && payload.staff_id) {
    payload.vendor_user_id = payload.staff_id;
  }
  if (!payload.staff_id && payload.vendor_user_id) {
    payload.staff_id = payload.vendor_user_id;
  }

  const dup = [...mealRecordStore.values()].find(
    (r) =>
      String(r.employee_id) === String(payload.employee_id) &&
      r.meal_type === payload.meal_type &&
      r.consumption_date === payload.consumption_date
  );
  if (dup) {
    const err = new Error('E11000 duplicate key error');
    err.code = 11000;
    throw err;
  }
  return _origMealRecordCreate(payload);
};

const _origEmployeeCreate = Employee.create.bind(Employee);
Employee.create = async function (data) {
  const payload = { ...data };
  if (!payload.worker_identifier && payload.employee_number) {
    payload.worker_identifier = payload.employee_number;
  }
  return _origEmployeeCreate(payload);
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

module.exports = {
  initializeDatabase,
  closeDatabase,
  User,
  Employee,
  Worker,
  MealPlan,
  WorkerCategory,
  Vendor,
  VendorRestriction,
  EntitlementPolicy,
  WorkerEntitlementBalance,
  MenuItem,
  MealRecord,
  Transaction,
  ReconciliationRecord,
  QRTokenMetadata,
  AuditLog
};
