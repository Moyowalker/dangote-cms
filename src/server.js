const app = require('./app');
const { initializeDatabase } = require('./database');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dangote-cms';
const PORT = process.env.PORT || 3001;

initializeDatabase(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Dangote CMS server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
