process.env.NODE_ENV = 'test';

jest.mock('../src/database');

const request = require('supertest');
const app = require('../src/app');
const { initializeDatabase, closeDatabase, Employee, MealRecord, AuditLog, WorkerCategory, Transaction, OfflineReconciliationBatch, DelegatedMealApproval } = require('../src/database');

let agent;

beforeAll(async () => {
  await initializeDatabase();
  agent = request.agent(app);
});

beforeEach(async () => {
  await agent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
  await AuditLog.deleteMany({});
  await MealRecord.deleteMany({});
  await Transaction.deleteMany({});
  await OfflineReconciliationBatch.deleteMany({});
  await DelegatedMealApproval.deleteMany({});
  await Employee.deleteMany({});
  await WorkerCategory.deleteMany({});
});

afterAll(async () => {
  await closeDatabase();
});

describe('Reconciliation and Reporting Aggregation', () => {
  test('GET /api/reconciliation/vendor-daily aggregates by vendor/date with discrepancy indicator', async () => {
    await Employee.create({
      employee_number: 'REC001',
      name: 'Recon User',
      department: 'Ops',
      badge_number: 'RECON-1'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-1', meal_type: 'lunch' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-1', meal_type: 'lunch' });

    const today = new Date().toISOString().split('T')[0];
    const res = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe(today);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(res.body.summary.length).toBeGreaterThan(0);
    expect(res.body.summary[0]).toHaveProperty('vendor_user_id');
    expect(res.body.summary[0]).toHaveProperty('total_consumptions');
    expect(res.body.summary[0]).toHaveProperty('failed_attempts');
    expect(res.body.summary[0]).toHaveProperty('discrepancy_indicator');
  });

  test('GET /api/reconciliation/vendor-daily rejects invalid date format', async () => {
    const res = await agent.get('/api/reconciliation/vendor-daily?date=21-03-2026');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/reconciliation/vendor-daily supports pagination when page/limit are provided', async () => {
    await Employee.create({
      employee_number: 'REC002',
      name: 'Recon User 2',
      department: 'Ops',
      badge_number: 'RECON-2'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-2', meal_type: 'lunch' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-2', meal_type: 'lunch' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reconciliation/vendor-daily?date=${today}&page=1&limit=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(res.body.summary.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('GET /api/reconciliation/vendor-daily/drilldown returns successful and failed attempt detail for a vendor location', async () => {
    await Employee.create({
      employee_number: 'REC003',
      name: 'Recon Detail User',
      department: 'Ops',
      badge_number: 'RECON-3'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-3', meal_type: 'lunch', canteen_location: 'Main Canteen' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-3', meal_type: 'lunch', canteen_location: 'Main Canteen' });

    const today = new Date().toISOString().split('T')[0];
    const summaryRes = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);
    const target = summaryRes.body.summary[0];

    const res = await agent.get(
      `/api/reconciliation/vendor-daily/drilldown?date=${today}&vendor_user_id=${target.vendor_user_id}&canteen_location=${encodeURIComponent(target.canteen_location)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.vendor_user_id).toBe(target.vendor_user_id);
    expect(res.body.canteen_location).toBe(target.canteen_location);
    expect(Array.isArray(res.body.successful_consumptions)).toBe(true);
    expect(Array.isArray(res.body.failed_attempts)).toBe(true);
    expect(res.body.summary.total_consumptions).toBe(1);
    expect(res.body.summary.consumptions_with_transaction).toBe(1);
    expect(res.body.summary.missing_transaction_links).toBe(0);
    expect(res.body.summary.failed_attempts).toBe(1);
    expect(res.body.summary.failures_with_confirmed_match).toBe(1);
    expect(res.body.summary.failures_confirmed_after_failure).toBe(0);
    expect(res.body.summary.unresolved_failed_attempts).toBe(0);
    expect(res.body.successful_consumptions[0].employee_name).toBe('Recon Detail User');
    expect(typeof res.body.successful_consumptions[0].transaction_reference).toBe('string');
    expect(res.body.failed_attempts[0].reason).toBe('Meal already recorded for this employee today');
    expect(res.body.failed_attempts[0].follow_up_status).toBe('already-confirmed-before-failure');
    expect(res.body.failed_attempts[0].matched_transaction_reference).toBe(res.body.successful_consumptions[0].transaction_reference);
  });

  test('GET /api/reconciliation/vendor-daily/drilldown flags confirmed consumptions missing transaction linkage', async () => {
    await Employee.create({
      employee_number: 'REC004',
      name: 'Recon Missing Link User',
      department: 'Ops',
      badge_number: 'RECON-4'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'RECON-4', meal_type: 'lunch', canteen_location: 'Main Canteen' });

    const mealRecord = await MealRecord.findOne({ consumption_date: new Date().toISOString().split('T')[0], canteen_location: 'Main Canteen' });
    await Transaction.deleteMany({ meal_record_id: mealRecord._id });

    const today = new Date().toISOString().split('T')[0];
    const summaryRes = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);
    const target = summaryRes.body.summary[0];

    const res = await agent.get(
      `/api/reconciliation/vendor-daily/drilldown?date=${today}&vendor_user_id=${target.vendor_user_id}&canteen_location=${encodeURIComponent(target.canteen_location)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.summary.total_consumptions).toBe(1);
    expect(res.body.summary.consumptions_with_transaction).toBe(0);
    expect(res.body.summary.missing_transaction_links).toBe(1);
    expect(res.body.successful_consumptions[0].transaction_reference).toBeNull();
    expect(res.body.successful_consumptions[0].has_transaction_link).toBe(false);
  });

  test('GET /api/reconciliation/vendor-daily/drilldown flags unresolved failed attempts without a matching confirmed consumption', async () => {
    const today = new Date().toISOString().split('T')[0];
    await AuditLog.create({
      actor_user_id: 'vendor-follow-up',
      actor_role: 'vendor',
      action: 'ticket.consume',
      entity_type: 'employee',
      entity_id: 'missing-worker',
      outcome: 'failure',
      reason: 'Eligibility check timed out before confirmation',
      metadata: {
        badge_number: 'FOLLOW-UP-1',
        meal_type: 'lunch',
        date: today,
        canteen_location: 'Main Canteen'
      }
    });

    const summaryRes = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);
    const target = summaryRes.body.summary.find((entry) => entry.vendor_user_id === 'vendor-follow-up' && entry.canteen_location === 'Main Canteen');

    const res = await agent.get(
      `/api/reconciliation/vendor-daily/drilldown?date=${today}&vendor_user_id=${target.vendor_user_id}&canteen_location=${encodeURIComponent(target.canteen_location)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.summary.total_consumptions).toBe(0);
    expect(res.body.summary.failed_attempts).toBe(1);
    expect(res.body.summary.failures_with_confirmed_match).toBe(0);
    expect(res.body.summary.unresolved_failed_attempts).toBe(1);
    expect(res.body.failed_attempts[0].follow_up_status).toBe('unresolved');
    expect(res.body.failed_attempts[0].matched_transaction_reference).toBeNull();
  });

  test('GET /api/reconciliation/vendor-daily/drilldown requires vendor and location filters', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await agent.get(`/api/reconciliation/vendor-daily/drilldown?date=${today}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/reconciliation/vendor-daily supports migrated vendor_user_id records without legacy staff_id', async () => {
    const employee = await Employee.create({
      employee_number: 'REC005',
      name: 'Recon Migrated User',
      department: 'Ops',
      badge_number: 'RECON-5'
    });

    const today = new Date().toISOString().split('T')[0];
    await MealRecord.create({
      employee_id: employee._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: today,
      vendor_user_id: 'vendor-migrated',
      staff_id: null,
      canteen_location: 'Main Canteen'
    });

    await AuditLog.create({
      actor_user_id: 'vendor-migrated',
      actor_role: 'vendor',
      action: 'ticket.consume',
      entity_type: 'employee',
      entity_id: employee.id,
      outcome: 'failure',
      reason: 'Meal already recorded for this employee today',
      metadata: {
        badge_number: 'RECON-5',
        meal_type: 'lunch',
        date: today,
        canteen_location: 'Main Canteen'
      }
    });

    const summaryRes = await agent.get(`/api/reconciliation/vendor-daily?date=${today}`);
    expect(summaryRes.status).toBe(200);

    const target = summaryRes.body.summary.find((entry) => entry.vendor_user_id === 'vendor-migrated');
    expect(target).toBeDefined();
    expect(target.total_consumptions).toBe(1);
    expect(target.failed_attempts).toBe(1);

    const drilldownRes = await agent.get(
      `/api/reconciliation/vendor-daily/drilldown?date=${today}&vendor_user_id=vendor-migrated&canteen_location=${encodeURIComponent('Main Canteen')}`
    );

    expect(drilldownRes.status).toBe(200);
    expect(drilldownRes.body.successful_consumptions).toHaveLength(1);
    expect(drilldownRes.body.failed_attempts).toHaveLength(1);
  });

  test('GET /api/reconciliation/vendor-daily ignores legacy staff_id-only rows when cutover flag is disabled', async () => {
    const previousValue = process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;

    try {
      process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED = 'false';
      jest.resetModules();
      jest.doMock('../src/database');

      const freshRequest = require('supertest');
      const freshApp = require('../src/app');
      const freshDatabase = require('../src/database');
      const {
        initializeDatabase: initializeFreshDatabase,
        closeDatabase: closeFreshDatabase,
        Employee: FreshEmployee,
        MealRecord: FreshMealRecord
      } = freshDatabase;

      await initializeFreshDatabase();

      const freshAgent = freshRequest.agent(freshApp);
      await freshAgent.post('/api/auth/login').send({ username: 'admin', password: 'admin123' });

      const employee = await FreshEmployee.create({
        employee_number: 'REC006',
        name: 'Recon Legacy Only User',
        department: 'Ops',
        badge_number: 'RECON-6'
      });

      const today = new Date().toISOString().split('T')[0];
      const legacyOnlyRecord = await FreshMealRecord.create({
        employee_id: employee._id,
        meal_type: 'lunch',
        status: 'used',
        consumption_date: today,
        vendor_user_id: null,
        staff_id: 'legacy-only-vendor',
        canteen_location: 'Main Canteen'
      });
      legacyOnlyRecord.vendor_user_id = null;

      const summaryRes = await freshAgent.get(`/api/reconciliation/vendor-daily?date=${today}`);
      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.summary.find((entry) => entry.vendor_user_id === 'legacy-only-vendor')).toBeUndefined();

      await closeFreshDatabase();
    } finally {
      if (previousValue === undefined) {
        delete process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED;
      } else {
        process.env.LEGACY_STAFF_ID_FALLBACK_ENABLED = previousValue;
      }

      jest.resetModules();
      jest.doMock('../src/database');
    }
  });

  test('POST /api/reconciliation/offline-batches stores reconciled offline device activity against confirmed transactions', async () => {
    await Employee.create({
      employee_number: 'OFF001',
      name: 'Offline Batch User',
      department: 'Ops',
      badge_number: 'OFF-BATCH-1'
    });

    const today = new Date().toISOString().split('T')[0];
    await agent.post('/api/tickets/consume').send({
      badge_number: 'OFF-BATCH-1',
      meal_type: 'lunch',
      canteen_location: 'Main Canteen'
    });

    const res = await agent.post('/api/reconciliation/offline-batches').send({
      device_id: 'vendor-device-1',
      device_label: 'Main gate tablet',
      batch_date: today,
      canteen_location: 'Main Canteen',
      redemptions: [
        {
          local_reference: 'queue-1',
          badge_number: 'OFF-BATCH-1',
          meal_type: 'lunch',
          client_outcome: 'synced'
        }
      ]
    });

    expect(res.status).toBe(201);
    expect(res.body.device_id).toBe('vendor-device-1');
    expect(res.body.status).toBe('reconciled');
    expect(res.body.summary.total_entries).toBe(1);
    expect(res.body.summary.matched_entries).toBe(1);
    expect(res.body.entries[0].status).toBe('matched');
    expect(typeof res.body.entries[0].matched_transaction_reference).toBe('string');
  });

  test('GET /api/reconciliation/offline-batches and /:id expose offline batch history for review', async () => {
    const absentEmployee = await Employee.create({
      employee_number: 'RECABS001',
      name: 'Absent Worker',
      department: 'Operations',
      badge_number: 'ABS-001'
    });
    const collector = await Employee.create({
      employee_number: 'RECCOL001',
      name: 'Approved Collector',
      department: 'Operations',
      badge_number: 'COL-001'
    });
    const approval = await DelegatedMealApproval.create({
      absent_employee_id: absentEmployee._id,
      collector_employee_id: collector._id,
      approved_by_user_id: '000000000000000000000001',
      approved_by_role: 'admin',
      approval_date: '2026-05-01',
      valid_until: new Date('2026-05-01T13:00:00.000Z'),
      meal_type: null,
      reason: 'Worker is on a production line',
      notes: null,
      status: 'consumed',
      consumed_at: new Date('2026-05-01T12:05:00.000Z')
    });
    const mealRecord = await MealRecord.create({
      employee_id: absentEmployee._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-05-01',
      consumed_at: new Date('2026-05-01T12:05:00.000Z'),
      vendor_user_id: '000000000000000000000001',
      collector_employee_id: collector._id,
      delegation_approval_id: approval._id,
      canteen_location: 'Annex'
    });

    const created = await OfflineReconciliationBatch.create({
      device_id: 'vendor-device-2',
      device_label: 'Annex tablet',
      batch_date: '2026-05-01',
      canteen_location: 'Annex',
      submitted_by_user_id: '000000000000000000000001',
      submitted_by_role: 'admin',
      status: 'needs_review',
      summary: {
        total_entries: 1,
        matched_entries: 0,
        unresolved_entries: 1,
        missing_transaction_links: 0,
        employee_not_found_entries: 1,
        client_failed_entries: 0
      },
      entries: [
        {
          local_reference: 'queue-2',
          badge_number: 'ABS-001',
          meal_type: 'lunch',
          client_outcome: 'synced',
          matched_meal_record_id: mealRecord._id,
          status: 'matched',
          resolution_reason: 'Matched to a confirmed transaction'
        }
      ]
    });

    const listRes = await agent.get('/api/reconciliation/offline-batches?date=2026-05-01');
    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.batches[0].id).toBe(created.id);

    const detailRes = await agent.get(`/api/reconciliation/offline-batches/${created.id}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.id).toBe(created.id);
    expect(detailRes.body.entries).toHaveLength(1);
    expect(detailRes.body.entries[0].resolution_reason).toMatch(/matched to a confirmed transaction/i);
    expect(detailRes.body.entries[0].delegation.collector.badge_number).toBe('COL-001');
    expect(detailRes.body.entries[0].delegation.absent_employee.badge_number).toBe('ABS-001');
    expect(detailRes.body.entries[0].delegation.reason).toMatch(/production line/i);
  });

  test('PATCH /api/reconciliation/offline-batches/:id/review updates review status and notes', async () => {
    const batch = await OfflineReconciliationBatch.create({
      device_id: 'vendor-device-3',
      batch_date: '2026-05-01',
      canteen_location: 'Main Canteen',
      submitted_by_user_id: '000000000000000000000001',
      submitted_by_role: 'admin',
      status: 'needs_review',
      summary: {
        total_entries: 1,
        matched_entries: 0,
        unresolved_entries: 1,
        missing_transaction_links: 0,
        employee_not_found_entries: 0,
        client_failed_entries: 1
      },
      entries: [
        {
          badge_number: 'OFF-BATCH-3',
          meal_type: 'lunch',
          client_outcome: 'sync_failed',
          client_error: 'Temporary network loss',
          status: 'unresolved',
          resolution_reason: 'No confirmed meal record found for this offline redemption'
        }
      ]
    });

    const res = await agent.patch(`/api/reconciliation/offline-batches/${batch.id}/review`).send({
      status: 'rejected',
      review_notes: 'Device queue requires manual follow-up'
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.review_notes).toBe('Device queue requires manual follow-up');
    expect(res.body.reviewed_at).toBeTruthy();
  });

  test('GET /api/reports/daily returns aggregation summary and details', async () => {
    await Employee.create({
      employee_number: 'REP001',
      name: 'Report User',
      department: 'Engineering',
      badge_number: 'REPORT-1'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'REPORT-1', meal_type: 'breakfast' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reports/daily?date=${today}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
    expect(typeof res.body.details[0].transaction_reference).toBe('string');
    expect(res.body.details[0].has_transaction_link).toBe(true);
  });

  test('GET /api/reports/daily supports pagination when page/limit are provided', async () => {
    await Employee.create({
      employee_number: 'REP002',
      name: 'Report User 2',
      department: 'Engineering',
      badge_number: 'REPORT-2'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'REPORT-2', meal_type: 'breakfast' });
    const today = new Date().toISOString().split('T')[0];

    const res = await agent.get(`/api/reports/daily?date=${today}&page=1&limit=1`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBe(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(1);
  });

  test('GET /api/reports/daily supports date range, vendor, status, and worker category filters', async () => {
    const categoryA = await WorkerCategory.create({ code: 'CAT-A', name: 'Category A' });
    const categoryB = await WorkerCategory.create({ code: 'CAT-B', name: 'Category B' });

    const empA = await Employee.create({
      employee_number: 'REP100',
      name: 'Filter User A',
      department: 'Ops',
      badge_number: 'FILTER-1',
      worker_category_id: categoryA._id
    });

    const empB = await Employee.create({
      employee_number: 'REP101',
      name: 'Filter User B',
      department: 'Ops',
      badge_number: 'FILTER-2',
      worker_category_id: categoryB._id
    });

    await MealRecord.create({
      employee_id: empA._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Main Canteen'
    });

    await MealRecord.create({
      employee_id: empB._id,
      meal_type: 'lunch',
      status: 'used',
      consumption_date: '2026-03-20',
      canteen_location: 'Annex Canteen'
    });

    const res = await agent.get(
      `/api/reports/daily?start_date=2026-03-19&end_date=2026-03-21&vendor=Main%20Canteen&status=used&worker_category_id=${categoryA._id}`
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.details[0].employee_id).toBe(String(empA._id));
    expect(res.body.details[0].canteen_location).toBe('Main Canteen');
    expect(res.body.details[0].status).toBe('used');
    expect(res.body.details[0].transaction_reference).toBeNull();
    expect(res.body.details[0].has_transaction_link).toBe(false);
  });

  test('GET /api/reports/daily rejects invalid status filter', async () => {
    const res = await agent.get('/api/reports/daily?status=invalid-status');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('GET /api/reports/failures returns failure summary and supports reason plus vendor filters', async () => {
    await Employee.create({
      employee_number: 'REP200',
      name: 'Failure User',
      department: 'Ops',
      badge_number: 'FAIL-1'
    });

    await agent.post('/api/tickets/consume').send({ badge_number: 'FAIL-1', meal_type: 'lunch', canteen_location: 'Main Canteen' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'FAIL-1', meal_type: 'lunch', canteen_location: 'Main Canteen' });
    await agent.post('/api/tickets/consume').send({ badge_number: 'UNKNOWN-BADGE', meal_type: 'lunch', canteen_location: 'Annex' });

    const today = new Date().toISOString().split('T')[0];
    const res = await agent.get(`/api/reports/failures?date=${today}&vendor=Main%20Canteen&reason=already%20recorded`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.summary)).toBe(true);
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.summary[0].reason).toBe('Meal already recorded for this employee today');
    expect(res.body.details[0].canteen_location).toBe('Main Canteen');
  });

  test('GET /api/reports/failures rejects invalid date filter', async () => {
    const res = await agent.get('/api/reports/failures?date=22-03-2026');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});