const crypto = require('crypto');
const { Vendor, Transaction } = require('../database');

function buildTransactionReference() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(4).toString('hex');
  return `TXN-${timestamp}-${suffix}`;
}

async function resolveVendorByCanteenLocation(canteenLocation) {
  if (!canteenLocation) {
    return null;
  }

  const vendor = await Vendor.findOne({ canteen_location: canteenLocation, active: true });
  return vendor || null;
}

async function createConsumptionTransaction({
  employeeId,
  mealType,
  transactionDate,
  mealRecordId,
  canteenLocation,
  metadata = {}
}) {
  const vendor = await resolveVendorByCanteenLocation(canteenLocation);

  const transaction = await Transaction.create({
    employee_id: employeeId,
    vendor_id: vendor ? vendor._id : null,
    meal_record_id: mealRecordId || null,
    transaction_reference: buildTransactionReference(),
    transaction_date: transactionDate,
    meal_type: mealType,
    status: 'success',
    metadata: {
      canteen_location: canteenLocation || 'Main Canteen',
      ...metadata
    }
  });

  return transaction;
}

module.exports = {
  createConsumptionTransaction,
  buildTransactionReference
};
