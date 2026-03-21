const express = require('express');
const mongoose = require('mongoose');
const { MealPlan, MenuItem } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');

const router = express.Router();
const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

// ── Meal Plans ────────────────────────────────────────────────────────────────

router.get('/meal-plans', requireAuth, async (req, res) => {
  try {
    const plans = await MealPlan.find().sort({ name: 1 });
    res.json(plans);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/meal-plans', requireAdmin, async (req, res) => {
  try {
    const { name, description, breakfast, lunch, dinner } = req.body;
    if (typeof name !== 'string' || !name.trim()) {
      return sendError(res, 400, 'Name is required', 'VALIDATION_ERROR');
    }

    const plan = await MealPlan.create({
      name: name.trim(),
      description: description || null,
      breakfast: breakfast !== undefined ? Boolean(breakfast) : true,
      lunch: lunch !== undefined ? Boolean(lunch) : true,
      dinner: dinner !== undefined ? Boolean(dinner) : false
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.put('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Meal plan not found', 'NOT_FOUND');
    }
    const { name, description, breakfast, lunch, dinner, active } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'name must be a non-empty string', 'VALIDATION_ERROR');
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description;
    if (breakfast !== undefined) updates.breakfast = Boolean(breakfast);
    if (lunch !== undefined) updates.lunch = Boolean(lunch);
    if (dinner !== undefined) updates.dinner = Boolean(dinner);
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await MealPlan.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return sendError(res, 404, 'Meal plan not found', 'NOT_FOUND');
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.delete('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Meal plan not found', 'NOT_FOUND');
    }
    const deleted = await MealPlan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendError(res, 404, 'Meal plan not found', 'NOT_FOUND');
    }
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

// ── Menu Items ────────────────────────────────────────────────────────────────

router.get('/menu-items', requireAuth, async (req, res) => {
  try {
    const { date, meal_type } = req.query;
    const filter = {};
    if (date) filter.available_date = date;
    if (meal_type) filter.meal_type = meal_type;
    const items = await MenuItem.find(filter).sort({ available_date: -1, meal_type: 1 });
    res.json(items);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.post('/menu-items', requireAdmin, async (req, res) => {
  try {
    const { name, description, meal_type, price, available_date } = req.body;
    if (typeof name !== 'string' || !name.trim() || typeof meal_type !== 'string' || typeof available_date !== 'string') {
      return sendError(res, 400, 'name, meal_type, and available_date are required', 'VALIDATION_ERROR');
    }
    if (!VALID_MEAL_TYPES.includes(meal_type)) {
      return sendError(res, 400, `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`, 'VALIDATION_ERROR');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(available_date)) {
      return sendError(res, 400, 'available_date must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
    }

    const item = await MenuItem.create({
      name: name.trim(),
      description: description || null,
      meal_type,
      price: price || 0,
      available_date
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.put('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Menu item not found', 'NOT_FOUND');
    }
    const { name, description, meal_type, price, available_date, active } = req.body;
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'name must be a non-empty string', 'VALIDATION_ERROR');
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description;
    if (meal_type !== undefined) {
      if (!VALID_MEAL_TYPES.includes(meal_type)) {
        return sendError(res, 400, `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}`, 'VALIDATION_ERROR');
      }
      updates.meal_type = meal_type;
    }
    if (price !== undefined) updates.price = price;
    if (available_date !== undefined) {
      if (typeof available_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(available_date)) {
        return sendError(res, 400, 'available_date must be in YYYY-MM-DD format', 'VALIDATION_ERROR');
      }
      updates.available_date = available_date;
    }
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return sendError(res, 404, 'Menu item not found', 'NOT_FOUND');
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

router.delete('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 404, 'Menu item not found', 'NOT_FOUND');
    }
    const deleted = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return sendError(res, 404, 'Menu item not found', 'NOT_FOUND');
    }
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, 500, 'Internal server error', 'INTERNAL_ERROR');
  }
});

module.exports = router;
