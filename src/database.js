const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

let db;

function initializeDatabase() {
  const isTest = process.env.NODE_ENV === 'test';
  
  if (!isTest) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }
  
  const dbPath = isTest ? ':memory:' : path.join(process.cwd(), 'data', 'cms.db');
  db = new Database(dbPath);
  
  if (!isTest) {
    db.pragma('journal_mode = WAL');
  }
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      employee_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      breakfast INTEGER DEFAULT 1,
      lunch INTEGER DEFAULT 1,
      dinner INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      badge_number TEXT UNIQUE NOT NULL,
      meal_plan_id INTEGER,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meal_plan_id) REFERENCES meal_plans(id)
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      meal_type TEXT NOT NULL,
      price REAL DEFAULT 0,
      available_date DATE NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS meal_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      meal_type TEXT NOT NULL,
      consumption_date DATE NOT NULL,
      consumed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      staff_id INTEGER,
      canteen_location TEXT DEFAULT 'Main Canteen',
      notes TEXT,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (staff_id) REFERENCES users(id),
      UNIQUE(employee_id, meal_type, consumption_date)
    );
  `);
  
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', hashedPassword, 'admin');
  }
  
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initializeDatabase, getDb, closeDatabase };
