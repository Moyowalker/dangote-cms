const app = require('./app');
const { initializeDatabase } = require('./database');
const { reportError } = require('./services/errorMonitoringService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/dangote-cms';
const PORT = process.env.PORT || 3001;

process.on('unhandledRejection', (reason) => {
  reportError(reason instanceof Error ? reason : new Error(String(reason)), {
    source: 'process.unhandledRejection'
  });
});

process.on('uncaughtException', (error) => {
  reportError(error, { source: 'process.uncaughtException' });
  process.exit(1);
});

initializeDatabase(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Dangote CMS server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    reportError(err, { source: 'startup.database' });
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
