/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const { MealRecord } = require('../src/database');

function buildSummaryLines(summary) {
  return [
    `total_records=${summary.totalRecords}`,
    `vendor_only_records=${summary.vendorOnlyRecords}`,
    `legacy_staff_only_records=${summary.legacyStaffOnlyRecords}`,
    `dual_field_records=${summary.dualFieldRecords}`,
    `matching_dual_field_records=${summary.matchingDualFieldRecords}`,
    `mismatched_dual_field_records=${summary.mismatchedDualFieldRecords}`,
    `missing_both_fields=${summary.missingBothFields}`
  ];
}

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  const strict = process.argv.includes('--strict');

  await mongoose.connect(mongoUri);

  const [
    totalRecords,
    vendorOnlyRecords,
    legacyStaffOnlyRecords,
    dualFieldRecords,
    matchingDualFieldRecords,
    mismatchedDualFieldRecords,
    missingBothFields
  ] = await Promise.all([
    MealRecord.countDocuments({}),
    MealRecord.countDocuments({ vendor_user_id: { $ne: null }, staff_id: null }),
    MealRecord.countDocuments({
      $or: [
        { vendor_user_id: { $exists: false } },
        { vendor_user_id: null }
      ],
      staff_id: { $ne: null }
    }),
    MealRecord.countDocuments({ vendor_user_id: { $ne: null }, staff_id: { $ne: null } }),
    MealRecord.countDocuments({
      vendor_user_id: { $ne: null },
      staff_id: { $ne: null },
      $expr: { $eq: ['$vendor_user_id', '$staff_id'] }
    }),
    MealRecord.countDocuments({
      vendor_user_id: { $ne: null },
      staff_id: { $ne: null },
      $expr: { $ne: ['$vendor_user_id', '$staff_id'] }
    }),
    MealRecord.countDocuments({
      $or: [
        {
          vendor_user_id: { $exists: false },
          staff_id: { $exists: false }
        },
        {
          vendor_user_id: null,
          staff_id: null
        }
      ]
    })
  ]);

  const summary = {
    totalRecords,
    vendorOnlyRecords,
    legacyStaffOnlyRecords,
    dualFieldRecords,
    matchingDualFieldRecords,
    mismatchedDualFieldRecords,
    missingBothFields
  };

  console.log('Vendor operator migration verification');
  for (const line of buildSummaryLines(summary)) {
    console.log(line);
  }

  if (strict && (legacyStaffOnlyRecords > 0 || mismatchedDualFieldRecords > 0 || missingBothFields > 0)) {
    throw new Error('Vendor operator migration is not yet complete');
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Vendor operator verification failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error('Disconnect failed:', disconnectErr.message);
  }
  process.exit(1);
});