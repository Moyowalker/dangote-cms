const express = require('express');
const mongoose = require('mongoose');
const { MealPlan, MenuItem } = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ── Meal Plans ────────────────────────────────────────────────────────────────

router.get('/meal-plans', requireAuth, async (req, res) => {
  try {
    const plans = await MealPlan.find().sort({ name: 1 });
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meal-plans', requireAdmin, async (req, res) => {
  try {
    const { name, description, breakfast, lunch, dinner } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const plan = await MealPlan.create({
      name,
      description: description || null,
      breakfast: breakfast !== undefined ? Boolean(breakfast) : true,
      lunch: lunch !== undefined ? Boolean(lunch) : true,
      dinner: dinner !== undefined ? Boolean(dinner) : false
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    const { name, description, breakfast, lunch, dinner, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
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
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    const deleted = await MealPlan.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Meal plan not found' });
    }
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/menu-items', requireAdmin, async (req, res) => {
  try {
    const { name, description, meal_type, price, available_date } = req.body;
    if (!name || !meal_type || !available_date) {
      return res.status(400).json({ error: 'name, meal_type, and available_date are required' });
    }
    const item = await MenuItem.create({
      name,
      description: description || null,
      meal_type,
      price: price || 0,
      available_date
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const { name, description, meal_type, price, available_date, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (meal_type !== undefined) updates.meal_type = meal_type;
    if (price !== undefined) updates.price = price;
    if (available_date !== undefined) updates.available_date = available_date;
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const deleted = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
