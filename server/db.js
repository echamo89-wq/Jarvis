const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_URL || path.join(DATA_DIR, 'jarvis.db');
let db = null;
let SQL = null;

function _save() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

async function initDatabase() {
  SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      key_encrypted TEXT NOT NULL,
      label TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)');

  _save();
  return db;
}

function getDb() {
  return db;
}

const dbApi = {
  prepare: (sql) => ({
    get: (...params) => {
      if (!db) return undefined;
      try {
        const stmt = db.prepare(sql);
        const args = params.length > 0 && Array.isArray(params[0]) ? params[0] : params;
        if (args.length > 0) stmt.bind(args);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => { row[c] = vals[i]; });
          stmt.free();
          return row;
        }
        stmt.free();
      } catch (e) { console.error('[DB] get error:', e.message, 'SQL:', sql); }
      return undefined;
    },
    all: (...params) => {
      if (!db) return [];
      try {
        const stmt = db.prepare(sql);
        const args = params.length > 0 && Array.isArray(params[0]) ? params[0] : params;
        if (args.length > 0) stmt.bind(args);
        const rows = [];
        const cols = stmt.getColumnNames();
        while (stmt.step()) {
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => { row[c] = vals[i]; });
          rows.push(row);
        }
        stmt.free();
        return rows;
      } catch (e) { console.error('[DB] all error:', e.message, 'SQL:', sql); }
      return [];
    },
    run: (...params) => {
      if (!db) return;
      try {
        db.run(sql);
        const args = params.length > 0 && Array.isArray(params[0]) ? params[0] : params;
        if (args.length > 0) {
          const stmt = db.prepare(sql);
          stmt.bind(args);
          stmt.step();
          stmt.free();
        }
        _save();
      } catch (e) { console.error('[DB] run error:', e.message, 'SQL:', sql); }
    }
  }),
  run: (sql, params) => {
    if (!db) return;
    try {
      if (params) {
        const stmt = db.prepare(sql);
        stmt.bind(params);
        stmt.step();
        stmt.free();
      } else {
        db.run(sql);
      }
      _save();
    } catch (e) { console.error('[DB] exec error:', e.message, 'SQL:', sql); }
  }
};

module.exports = { db: dbApi, initDatabase, getDb };
