const mongoose = require('mongoose');
const { MealPlan, MenuItem } = require('../database');

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function makeError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function listMealPlans() {
  return MealPlan.find().sort({ name: 1 });
}

async function createMealPlan(payload) {
  const { name, description, breakfast, lunch, dinner } = payload;
  if (typeof name !== 'string' || !name.trim()) {
    throw makeError(400, 'VALIDATION_ERROR', 'Name is required');
  }

  return MealPlan.create({
    name: name.trim(),
    description: description || null,
    breakfast: breakfast !== undefined ? Boolean(breakfast) : true,
    lunch: lunch !== undefined ? Boolean(lunch) : true,
    dinner: dinner !== undefined ? Boolean(dinner) : false
  });
}

async function updateMealPlan(id, payload) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Meal plan not found');
  }

  const { name, description, breakfast, lunch, dinner, active } = payload;
  const updates = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
    }
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description;
  if (breakfast !== undefined) updates.breakfast = Boolean(breakfast);
  if (lunch !== undefined) updates.lunch = Boolean(lunch);
  if (dinner !== undefined) updates.dinner = Boolean(dinner);
  if (active !== undefined) updates.active = Boolean(active);

  const updated = await MealPlan.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw makeError(404, 'NOT_FOUND', 'Meal plan not found');
  }

  return updated;
}

async function deleteMealPlan(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Meal plan not found');
  }

  const deleted = await MealPlan.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Meal plan not found');
  }

  return deleted;
}

async function listMenuItems(query) {
  const { date, meal_type } = query;
  const filter = {};
  if (date) filter.available_date = date;
  if (meal_type) filter.meal_type = meal_type;

  return MenuItem.find(filter).sort({ available_date: -1, meal_type: 1 });
}

async function createMenuItem(payload) {
  const { name, description, meal_type, price, available_date } = payload;
  if (typeof name !== 'string' || !name.trim() || typeof meal_type !== 'string' || typeof available_date !== 'string') {
    throw makeError(400, 'VALIDATION_ERROR', 'name, meal_type, and available_date are required');
  }
  if (!VALID_MEAL_TYPES.includes(meal_type)) {
    throw makeError(400, 'VALIDATION_ERROR', `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(available_date)) {
    throw makeError(400, 'VALIDATION_ERROR', 'available_date must be in YYYY-MM-DD format');
  }

  return MenuItem.create({
    name: name.trim(),
    description: description || null,
    meal_type,
    price: price || 0,
    available_date
  });
}

async function updateMenuItem(id, payload) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Menu item not found');
  }

  const { name, description, meal_type, price, available_date, active } = payload;
  const updates = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      throw makeError(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
    }
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description;
  if (meal_type !== undefined) {
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      throw makeError(400, 'VALIDATION_ERROR', `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`);
    }
    updates.meal_type = meal_type;
  }
  if (price !== undefined) updates.price = price;
  if (available_date !== undefined) {
    if (typeof available_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(available_date)) {
      throw makeError(400, 'VALIDATION_ERROR', 'available_date must be in YYYY-MM-DD format');
    }
    updates.available_date = available_date;
  }
  if (active !== undefined) updates.active = Boolean(active);

  const updated = await MenuItem.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw makeError(404, 'NOT_FOUND', 'Menu item not found');
  }

  return updated;
}

async function deleteMenuItem(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw makeError(404, 'NOT_FOUND', 'Menu item not found');
  }

  const deleted = await MenuItem.findByIdAndDelete(id);
  if (!deleted) {
    throw makeError(404, 'NOT_FOUND', 'Menu item not found');
  }

  return deleted;
}

module.exports = {
  VALID_MEAL_TYPES,
  listMealPlans,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
};
