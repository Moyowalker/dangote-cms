/* eslint-disable no-console */
require('dotenv').config();

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { User, Employee, WorkerCategory, EntitlementPolicy } = require('../src/database');

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

async function seedRoles() {
  const users = [
    { username: 'vendor.demo', role: 'vendor' },
    { username: 'viewer.demo', role: 'viewer' },
    { username: 'hr.demo', role: 'hr' }
  ];

  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password) {
    throw new Error('SEED_DEFAULT_PASSWORD is required for non-production seeding');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  for (const user of users) {
    const existing = await User.findOne({ username: user.username });
    if (!existing) {
      await User.create({
        username: user.username,
        password: hashedPassword,
        role: user.role
      });
    }
  }
}

async function seedEntitlementDefaults() {
  const categoryCode = 'GENERAL';
  let category = await WorkerCategory.findOne({ code: categoryCode });
  if (!category) {
    category = await WorkerCategory.create({
      code: categoryCode,
      name: 'General Workforce',
      description: 'Default workforce category for bootstrap environments',
      active: true
    });
  }

  for (const mealType of MEAL_TYPES) {
    const existing = await EntitlementPolicy.findOne({ worker_category_id: category._id, meal_type: mealType });
    if (!existing) {
      await EntitlementPolicy.create({
        worker_category_id: category._id,
        meal_type: mealType,
        daily_limit: 1,
        active: true
      });
    }
  }

  return category;
}

async function seedEmployeePortalDemo(category) {
  const password = process.env.SEED_DEFAULT_PASSWORD;
  const hashedPassword = await bcrypt.hash(password, 10);

  let employee = await Employee.findOne({ employee_number: 'EMP-DEMO-001' });
  if (!employee) {
    employee = await Employee.create({
      worker_identifier: 'EMP-DEMO-001',
      employee_number: 'EMP-DEMO-001',
      name: 'Employee Demo',
      department: 'Operations',
      email: 'employee.demo@dangote.local',
      phone: '08001234001',
      badge_number: 'BADGE-DEMO-001',
      worker_category_id: category?._id || null,
      status: 'active',
      active: true
    });
  }

  const existing = await User.findOne({ username: 'employee.demo', role: 'employee' });
  if (!existing) {
    await User.create({
      username: 'employee.demo',
      password: hashedPassword,
      role: 'employee',
      employee_id: employee._id
    });
  }
}

async function run() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-nonprod cannot run in production');
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(mongoUri);
  await seedRoles();
  const category = await seedEntitlementDefaults();
  await seedEmployeePortalDemo(category);
  await mongoose.disconnect();
  console.log('Non-production seed completed successfully');
}

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error('Disconnect failed:', disconnectErr.message);
  }
  process.exit(1);
});
