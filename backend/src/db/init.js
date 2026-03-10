const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/crm.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.run(schema);
  db.run('PRAGMA foreign_keys=ON');
  saveDatabase();
  console.log('Database initialized successfully');
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

function saveDatabase() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function execute(sql, params = []) {
  db.run(sql, params);
  const changesResult = queryOne('SELECT changes() as changes');
  const lastIdResult = queryOne('SELECT last_insert_rowid() as id');
  saveDatabase();
  return { changes: changesResult?.changes || 0, lastId: lastIdResult?.id || 0 };
}

module.exports = { initDatabase, getDb, saveDatabase, queryAll, queryOne, execute };
