const app = require('./app');
const { initializeDatabase } = require('./database');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dangote-cms';

initializeDatabase(MONGO_URI)
  .then(() => {
    app.listen(3000, () => {
      console.log('Dangote CMS server running on port 3000');
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
