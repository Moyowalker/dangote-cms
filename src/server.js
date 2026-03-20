const app = require('./app');
const { initializeDatabase } = require('./database');

initializeDatabase();

app.listen(3000, () => {
  console.log('Dangote CMS server running on port 3000');
});
