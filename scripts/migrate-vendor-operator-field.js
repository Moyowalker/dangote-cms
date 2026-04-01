/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const { MealRecord } = require('../src/database');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(mongoUri);

  const result = await MealRecord.updateMany(
    {
      $or: [
        { vendor_user_id: { $exists: false } },
        { vendor_user_id: null }
      ],
      staff_id: { $ne: null }
    },
    [
      {
        $set: {
          vendor_user_id: '$staff_id'
        }
      }
    ]
  );

  console.log(`Vendor operator migration complete. modified=${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Vendor operator migration failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error('Disconnect failed:', disconnectErr.message);
  }
  process.exit(1);
});