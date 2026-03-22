const express = require('express');
const { requireReportViewer } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { getPagination, paginateArray } = require('../utils/pagination');
const { buildVendorDailyReconciliation, buildVendorDailyDrilldown } = require('../services/reconciliationService');

const router = express.Router();

router.get('/vendor-daily', requireReportViewer, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const reconciliation = await buildVendorDailyReconciliation(date);
    const summary = reconciliation.summary || [];

    const { hasPagination, page, limit } = getPagination(req.query);
    if (!hasPagination) {
      return res.json({ date, total_vendors: summary.length, summary });
    }

    const paginated = paginateArray(summary, page, limit);
    return res.json({
      date,
      total_vendors: summary.length,
      summary: paginated.data,
      pagination: paginated.pagination
    });
  } catch (err) {
    console.error('Reconciliation vendor-daily error:', err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

router.get('/vendor-daily/drilldown', requireReportViewer, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const drilldown = await buildVendorDailyDrilldown({
      date,
      vendor_user_id: req.query.vendor_user_id,
      canteen_location: req.query.canteen_location
    });

    return res.json(drilldown);
  } catch (err) {
    console.error('Reconciliation vendor-daily drilldown error:', err);
    sendError(res, err.status || 500, err.message || 'Internal server error', err.code || 'INTERNAL_ERROR');
  }
});

module.exports = router;