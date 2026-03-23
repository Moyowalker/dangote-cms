/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const { Employee } = require('../src/database');

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(mongoUri);

  const result = await Employee.updateMany(
    {
      $or: [
        { worker_identifier: { $exists: false } },
        { worker_identifier: null },
        { worker_identifier: '' }
      ]
    },
    [
      {
        $set: {
          worker_identifier: '$employee_number'
        }
      }
    ]
  );

  console.log(`Worker identifier migration complete. modified=${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Worker identifier migration failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error('Disconnect failed:', disconnectErr.message);
  }
  process.exit(1);
});
