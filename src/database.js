const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
    role: { type: String, enum: ['admin', 'staff', 'employee'], default: 'employee' },
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }
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
    employee_number: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    department: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, default: null },
    phone: { type: String, default: null },
    badge_number: { type: String, required: true, unique: true },
    meal_plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MealPlan', default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false }, toJSON: { transform: idTransform } }
);

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
    // Stored as YYYY-MM-DD string to avoid timezone conversion complexity at the API boundary
    consumption_date: { type: String, required: true },
    consumed_at: { type: Date, default: Date.now },
    staff_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    canteen_location: { type: String, default: 'Main Canteen' },
    notes: { type: String, default: null }
  },
  { toJSON: { transform: idTransform } }
);

// Prevent an employee from having the same meal type twice in one day
mealRecordSchema.index({ employee_id: 1, meal_type: 1, consumption_date: 1 }, { unique: true });

// ── Models ───────────────────────────────────────────────────────────────────

const User = mongoose.model('User', userSchema);
const MealPlan = mongoose.model('MealPlan', mealPlanSchema);
const Employee = mongoose.model('Employee', employeeSchema);
const MenuItem = mongoose.model('MenuItem', menuItemSchema);
const MealRecord = mongoose.model('MealRecord', mealRecordSchema);

// ── Connection helpers ────────────────────────────────────────────────────────

async function initializeDatabase(uri) {
  await mongoose.connect(uri);

  // Seed default admin user on first run
  const adminExists = await User.findOne({ username: 'admin' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await User.create({ username: 'admin', password: hashedPassword, role: 'admin' });
  }
}

async function closeDatabase() {
  await mongoose.disconnect();
}

module.exports = { initializeDatabase, closeDatabase, User, MealPlan, Employee, MenuItem, MealRecord };
