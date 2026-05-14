const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const {
  listMealPlans,
  createMealPlan,
  updateMealPlan,
  deleteMealPlan,
  listMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem
} = require('../services/mealAdminService');

const router = express.Router();

// ── Meal Plans ────────────────────────────────────────────────────────────────

router.get('/meal-plans', requireAuth, async (req, res) => {
  try {
    const plans = await listMealPlans();
    res.json(plans);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/meal-plans', requireAdmin, async (req, res) => {
  try {
    const plan = await createMealPlan(req.body);
    res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateMealPlan(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete('/meal-plans/:id', requireAdmin, async (req, res) => {
  try {
    await deleteMealPlan(req.params.id);
    res.json({ message: 'Meal plan deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

// ── Menu Items ────────────────────────────────────────────────────────────────

router.get('/menu-items', requireAdmin, async (req, res) => {
  try {
    const items = await listMenuItems(req.query);
    res.json(items);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.post('/menu-items', requireAdmin, async (req, res) => {
  try {
    const item = await createMenuItem(req.body);
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.put('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    const updated = await updateMenuItem(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.delete('/menu-items/:id', requireAdmin, async (req, res) => {
  try {
    await deleteMenuItem(req.params.id);
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    console.error(err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

module.exports = router;
