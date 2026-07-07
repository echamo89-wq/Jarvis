const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_URL || path.join(DATA_DIR, 'jarvis.db');
let db = null;

async function initDatabase() {
  // better-sqlite3 es síncrono y nativo — sin WASM, sin bloqueos al arrancar
  db = new BetterSqlite3(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      key_encrypted TEXT NOT NULL,
      label TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      last_used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)');

  return db;
}

function getDb() {
  return db;
}

// Interfaz compatible con el código existente que usa db.prepare(...).get/all/run
const dbApi = {
  prepare: (sql) => db.prepare(sql),
  run: (sql, params) => {
    if (params) {
      return db.prepare(sql).run(params);
    }
    return db.prepare(sql).run();
  }
};

module.exports = { db: dbApi, initDatabase, getDb };
