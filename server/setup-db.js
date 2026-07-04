require('dotenv').config();
const { initDatabase, getDb } = require('./db');

console.log('[DB] Inicializando base de datos...');
initDatabase();
const db = getDb();
console.log('[DB] Tablas creadas:');
const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('[DB] Base de datos lista.');
