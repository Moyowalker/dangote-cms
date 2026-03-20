const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFile = process.env.NODE_ENV === 'test' ? 'canteen_test.db' : 'canteen.db';
const dbPath = path.join(dataDir, dbFile);

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','hr','worker','vendor')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      meal_plan TEXT NOT NULL CHECK(meal_plan IN ('breakfast','lunch','dinner','all')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meal_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      ticket_code TEXT UNIQUE NOT NULL,
      meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner')),
      valid_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','used','expired')),
      issued_by INTEGER NOT NULL,
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id),
      FOREIGN KEY (issued_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      vendor_user_id INTEGER NOT NULL,
      redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (ticket_id) REFERENCES meal_tickets(id),
      FOREIGN KEY (vendor_user_id) REFERENCES users(id)
    );
  `);

  // Seed admin user if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    const passwordHash = bcrypt.hashSync('Admin@123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', passwordHash, 'admin');
  }

  // Seed vendor user if not exists
  const vendorExists = db.prepare('SELECT id FROM users WHERE username = ?').get('vendor1');
  if (!vendorExists) {
    const passwordHash = bcrypt.hashSync('Vendor@123', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('vendor1', passwordHash, 'vendor');
  }

  // Seed hr user if not exists
  const hrExists = db.prepare('SELECT id FROM users WHERE username = ?').get('hr1');
  if (!hrExists) {
    const passwordHash = bcrypt.hashSync('Hr@123456', 10);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('hr1', passwordHash, 'hr');
  }

  // Seed sample workers if none exist
  const workerCount = db.prepare('SELECT COUNT(*) as count FROM workers').get();
  if (workerCount.count === 0) {
    const workers = [
      { employee_id: 'EMP001', name: 'John Doe', department: 'Engineering', meal_plan: 'all' },
      { employee_id: 'EMP002', name: 'Jane Smith', department: 'Finance', meal_plan: 'lunch' },
      { employee_id: 'EMP003', name: 'Bob Johnson', department: 'HR', meal_plan: 'breakfast' },
      { employee_id: 'EMP004', name: 'Alice Brown', department: 'Operations', meal_plan: 'all' },
      { employee_id: 'EMP005', name: 'Charlie Wilson', department: 'Engineering', meal_plan: 'lunch' },
    ];
    const insertWorker = db.prepare('INSERT INTO workers (employee_id, name, department, meal_plan) VALUES (?, ?, ?, ?)');
    workers.forEach(w => insertWorker.run(w.employee_id, w.name, w.department, w.meal_plan));
  }
}

initializeDatabase();

module.exports = db;
