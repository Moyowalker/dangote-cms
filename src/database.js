const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { canonicalizeRole } = require('./utils/roles');

function isLegacyStaffIdFallbackEnabled() {
  const configured = process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;

  if (configured === undefined) {
    return true;
  }

  return !['0', 'false', 'no', 'off'].includes(String(configured).trim().toLowerCase());
}

// Helper: apply common toJSON transform (rename _id → id, remove __v)
function idTransform(doc, ret) {
  ret.id = ret._id.toString();
  delete ret._id;
  delete ret.__v;
  return ret;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['admin', 'vendor', 'viewer', 'hr', 'staff', 'employee'],
      default: 'viewer',
      set: (value) => canonicalizeRole(value)
    },
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    password_recovery_token_hash: { type: String, default: null },
    password_recovery_expires_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

const mealPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    breakfast: { type: Boolean, default: true },
    lunch: { type: Boolean, default: true },
    dinner: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

const employeeSchema = new mongoose.Schema(
  {
    worker_identifier: { type: String, required: true, unique: true, alias: 'employee_identifier' },
    employee_number: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, default: null },
    phone: { type: String, default: null },
    photo_data_url: { type: String, default: null },
    badge_number: { type: String, required: true, unique: true },
    status: { type: String, enum: ['active', 'suspended', 'deactivated'], default: 'active' },
    worker_category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerCategory', default: null, alias: 'employee_category_id' },
    meal_plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MealPlan', default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

employeeSchema.index({ created_at: -1 });

employeeSchema.pre('validate', function syncWorkerIdentifier() {
  if (!this.worker_identifier && this.employee_identifier) {
    this.worker_identifier = this.employee_identifier;
  }
  if (!this.worker_identifier && this.employee_number) {
    this.worker_identifier = this.employee_number;
  }
  if (!this.employee_identifier && this.worker_identifier) {
    this.employee_identifier = this.worker_identifier;
  }
});

const workerCategorySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

const vendorSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    canteen_location: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

vendorSchema.index({ canteen_location: 1 });

const vendorRestrictionSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    worker_category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerCategory', required: true, alias: 'employee_category_id' },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

vendorRestrictionSchema.index({ vendor_id: 1, worker_category_id: 1, meal_type: 1 }, { unique: true });

const transactionSchema = new mongoose.Schema(
  {
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    meal_record_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MealRecord', default: null },
    transaction_reference: { type: String, required: true, unique: true },
    transaction_date: { type: String, required: true },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    status: { type: String, enum: ['success', 'failed', 'reversed'], default: 'success' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

transactionSchema.index({ vendor_id: 1, transaction_date: 1 });
transactionSchema.index({ employee_id: 1, transaction_date: 1 });

const reconciliationRecordSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    reconciliation_date: { type: String, required: true },
    expected_count: { type: Number, default: 0 },
    actual_count: { type: Number, default: 0 },
    discrepancy_count: { type: Number, default: 0 },
    status: { type: String, enum: ['matched', 'mismatch'], default: 'matched' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

reconciliationRecordSchema.index({ vendor_id: 1, reconciliation_date: 1 }, { unique: true });

const offlineReconciliationBatchSchema = new mongoose.Schema(
  {
    device_id: { type: String, required: true },
    device_label: { type: String, default: null },
    batch_date: { type: String, required: true },
    canteen_location: { type: String, required: true },
    submitted_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submitted_by_role: { type: String, default: null },
    status: { type: String, enum: ['received', 'reconciled', 'needs_review', 'rejected'], default: 'received' },
    summary: {
      total_entries: { type: Number, default: 0 },
      matched_entries: { type: Number, default: 0 },
      unresolved_entries: { type: Number, default: 0 },
      missing_transaction_links: { type: Number, default: 0 },
      employee_not_found_entries: { type: Number, default: 0 },
      client_failed_entries: { type: Number, default: 0 }
    },
    entries: [{
      local_reference: { type: String, default: null },
      badge_number: { type: String, required: true },
      meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
      queued_at: { type: Date, default: null },
      client_outcome: { type: String, enum: ['synced', 'duplicate', 'sync_failed'], default: 'synced' },
      client_error: { type: String, default: null },
      employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
      employee_name: { type: String, default: null },
      employee_number: { type: String, default: null },
      status: { type: String, enum: ['matched', 'matched_without_transaction', 'unresolved'], default: 'unresolved' },
      resolution_reason: { type: String, default: null },
      matched_meal_record_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MealRecord', default: null },
      matched_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
      matched_transaction_reference: { type: String, default: null }
    }],
    review_notes: { type: String, default: null },
    reviewed_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

offlineReconciliationBatchSchema.index({ batch_date: 1, created_at: -1 });
offlineReconciliationBatchSchema.index({ device_id: 1, batch_date: 1, created_at: -1 });
offlineReconciliationBatchSchema.index({ submitted_by_user_id: 1, created_at: -1 });

const delegatedMealApprovalSchema = new mongoose.Schema(
  {
    absent_employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    collector_employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    approved_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approved_by_role: { type: String, default: null },
    approval_date: { type: String, required: true },
    valid_until: { type: Date, required: true },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], default: null },
    reason: { type: String, required: true },
    notes: { type: String, default: null },
    issued_token_jti: { type: String, default: null },
    status: { type: String, enum: ['active', 'consumed', 'expired', 'revoked'], default: 'active' },
    consumed_at: { type: Date, default: null }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

delegatedMealApprovalSchema.index({ absent_employee_id: 1, approval_date: -1, created_at: -1 });
delegatedMealApprovalSchema.index({ collector_employee_id: 1, approval_date: -1, created_at: -1 });
delegatedMealApprovalSchema.index({ status: 1, valid_until: 1, created_at: -1 });

const qrTokenMetadataSchema = new mongoose.Schema(
  {
    token_jti: { type: String, required: true, unique: true },
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    delegation_approval_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DelegatedMealApproval', default: null },
    collector_employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    issued_by_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    issued_by_role: { type: String, default: null },
    issuance_channel: { type: String, enum: ['standard', 'delegated_helpdesk'], default: 'standard' },
    delegation_reason: { type: String, default: null },
    expires_at: { type: Date, required: true },
    issued_at: { type: Date, default: Date.now },
    last_used_at: { type: Date, default: null },
    consumed_at: { type: Date, default: null },
    revoked: { type: Boolean, default: false }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

qrTokenMetadataSchema.index({ employee_id: 1, expires_at: -1 });
qrTokenMetadataSchema.index({ expires_at: 1 });
qrTokenMetadataSchema.index({ consumed_at: 1 });
qrTokenMetadataSchema.index({ delegation_approval_id: 1, issued_at: -1 });

const entitlementPolicySchema = new mongoose.Schema(
  {
    worker_category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkerCategory', required: true, alias: 'employee_category_id' },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    daily_limit: { type: Number, default: 1, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

entitlementPolicySchema.index({ worker_category_id: 1, meal_type: 1 }, { unique: true });

const workerEntitlementBalanceSchema = new mongoose.Schema(
  {
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    balance_date: { type: String, required: true },
    allowed: { type: Number, default: 1, min: 0 },
    consumed: { type: Number, default: 0, min: 0 }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

workerEntitlementBalanceSchema.index({ employee_id: 1, meal_type: 1, balance_date: 1 }, { unique: true });

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    price: { type: Number, default: 0 },
    // Stored as YYYY-MM-DD string to avoid timezone conversion complexity at the API boundary
    available_date: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  { toJSON: { transform: idTransform } }
);

const mealRecordSchema = new mongoose.Schema(
  {
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    meal_type: { type: String, enum: ['breakfast', 'lunch', 'dinner'], required: true },
    status: { type: String, enum: ['used', 'voided'], default: 'used' },
    // Stored as YYYY-MM-DD string to avoid timezone conversion complexity at the API boundary
    consumption_date: { type: String, required: true },
    consumed_at: { type: Date, default: Date.now },
    vendor_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    collector_employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    delegation_approval_id: { type: mongoose.Schema.Types.ObjectId, ref: 'DelegatedMealApproval', default: null },
    // Legacy persisted field retained during the vendor_user_id migration.
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    canteen_location: { type: String, default: 'Main Canteen' },
    notes: { type: String, default: null }
  },
  { toJSON: { transform: idTransform } }
);

mealRecordSchema.pre('validate', function syncVendorOperatorFields() {
  if (!this.vendor_user_id && this.staff_id) {
    this.vendor_user_id = this.staff_id;
  }

  if (isLegacyStaffIdFallbackEnabled() && !this.staff_id && this.vendor_user_id) {
    this.staff_id = this.vendor_user_id;
  }
});

// Prevent an employee from having the same meal type twice in one day
mealRecordSchema.index({ employee_id: 1, meal_type: 1, consumption_date: 1 }, { unique: true });

const auditLogSchema = new mongoose.Schema(
  {
    actor_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actor_role: { type: String, default: null },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, default: null },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    reason: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    prev_hash: { type: String, default: null },
    hash: { type: String, required: true }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
    toJSON: { transform: idTransform }
  }
);

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ action: 1, created_at: -1 });
auditLogSchema.index({ entity_type: 1, entity_id: 1, created_at: -1 });
auditLogSchema.index({ hash: 1 }, { unique: true });

function preventAuditMutation(next) {
  next(new Error('AuditLog is append-only and cannot be modified or deleted'));
}

auditLogSchema.pre('findOneAndUpdate', preventAuditMutation);
auditLogSchema.pre('updateOne', preventAuditMutation);
auditLogSchema.pre('updateMany', preventAuditMutation);
auditLogSchema.pre('findOneAndDelete', preventAuditMutation);
auditLogSchema.pre('deleteOne', preventAuditMutation);
auditLogSchema.pre('deleteMany', preventAuditMutation);

// ── Models ───────────────────────────────────────────────────────────────────

const User = mongoose.model('User', userSchema);
const MealPlan = mongoose.model('MealPlan', mealPlanSchema);
const Employee = mongoose.model('Employee', employeeSchema);
const Worker = mongoose.model('Worker', employeeSchema, 'employees');
const WorkerCategory = mongoose.model('WorkerCategory', workerCategorySchema);
const EmployeeCategory = WorkerCategory;
const Vendor = mongoose.model('Vendor', vendorSchema);
const VendorRestriction = mongoose.model('VendorRestriction', vendorRestrictionSchema);
const EntitlementPolicy = mongoose.model('EntitlementPolicy', entitlementPolicySchema);
const WorkerEntitlementBalance = mongoose.model('WorkerEntitlementBalance', workerEntitlementBalanceSchema);
const EmployeeEntitlementBalance = WorkerEntitlementBalance;
const MenuItem = mongoose.model('MenuItem', menuItemSchema);
const MealRecord = mongoose.model('MealRecord', mealRecordSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const ReconciliationRecord = mongoose.model('ReconciliationRecord', reconciliationRecordSchema);
const OfflineReconciliationBatch = mongoose.model('OfflineReconciliationBatch', offlineReconciliationBatchSchema);
const DelegatedMealApproval = mongoose.model('DelegatedMealApproval', delegatedMealApprovalSchema);
const QRTokenMetadata = mongoose.model('QRTokenMetadata', qrTokenMetadataSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// ── Connection helpers ────────────────────────────────────────────────────────

async function initializeDatabase(uri) {
  await mongoose.connect(uri);

  // Optional bootstrap user for non-production provisioning.
  const adminExists = await User.findOne({ username: 'admin' });
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const forceAdminPasswordReset = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ADMIN_RESET_PASSWORD_ON_START || '').trim().toLowerCase()
  );
  const forceDemoUserReset = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.DEMO_USERS_RESET_PASSWORDS_ON_START || '').trim().toLowerCase()
  );

  if (adminExists && bootstrapPassword && forceAdminPasswordReset) {
    adminExists.password = await bcrypt.hash(bootstrapPassword, 10);
    adminExists.role = 'admin';
    await adminExists.save();
  }

  if (!adminExists && bootstrapPassword) {
    const hashedPassword = await bcrypt.hash(bootstrapPassword, 10);
    await User.create({ username: 'admin', password: hashedPassword, role: 'admin' });
  }

  const seedPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (seedPassword && forceDemoUserReset) {
    const hashedSeedPassword = await bcrypt.hash(seedPassword, 10);
    const demoUsers = [
      { username: 'vendor.demo', role: 'vendor' },
      { username: 'viewer.demo', role: 'viewer' },
      { username: 'hr.demo', role: 'hr' }
    ];

    for (const demoUser of demoUsers) {
      const existing = await User.findOne({ username: demoUser.username });
      if (existing) {
        existing.password = hashedSeedPassword;
        existing.role = demoUser.role;
        await existing.save();
      } else {
        await User.create({
          username: demoUser.username,
          password: hashedSeedPassword,
          role: demoUser.role
        });
      }
    }

    let generalCategory = await WorkerCategory.findOne({ code: 'GENERAL' });
    if (!generalCategory) {
      generalCategory = await WorkerCategory.create({
        code: 'GENERAL',
        name: 'General Workforce',
        description: 'Default workforce category for bootstrap environments',
        active: true
      });
    }

    for (const mealType of ['breakfast', 'lunch', 'dinner']) {
      const existingPolicy = await EntitlementPolicy.findOne({ worker_category_id: generalCategory._id, meal_type: mealType });
      if (!existingPolicy) {
        await EntitlementPolicy.create({
          worker_category_id: generalCategory._id,
          meal_type: mealType,
          daily_limit: 1,
          active: true
        });
      }
    }

    let demoEmployee = await Employee.findOne({ employee_number: 'EMP-DEMO-001' });
    if (!demoEmployee) {
      demoEmployee = await Employee.create({
        worker_identifier: 'EMP-DEMO-001',
        employee_number: 'EMP-DEMO-001',
        name: 'Employee Demo',
        department: 'Operations',
        email: 'employee.demo@dangote.local',
        phone: '08001234001',
        badge_number: 'BADGE-DEMO-001',
        worker_category_id: generalCategory._id,
        status: 'active',
        active: true
      });
    }

    const existingEmployeeUser = await User.findOne({ username: 'employee.demo' });
    if (existingEmployeeUser) {
      existingEmployeeUser.password = hashedSeedPassword;
      existingEmployeeUser.role = 'employee';
      existingEmployeeUser.employee_id = demoEmployee._id;
      await existingEmployeeUser.save();
    } else {
      await User.create({
        username: 'employee.demo',
        password: hashedSeedPassword,
        role: 'employee',
        employee_id: demoEmployee._id
      });
    }
  }
}

async function closeDatabase() {
  await mongoose.disconnect();
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  User,
  MealPlan,
  Employee,
  Worker,
  WorkerCategory,
  EmployeeCategory,
  Vendor,
  VendorRestriction,
  EntitlementPolicy,
  WorkerEntitlementBalance,
  EmployeeEntitlementBalance,
  MenuItem,
  MealRecord,
  Transaction,
  ReconciliationRecord,
  OfflineReconciliationBatch,
  DelegatedMealApproval,
  QRTokenMetadata,
  AuditLog
};
