const { Pool } = require('pg');
// Load .env here as well so this module works when required directly
// (e.g. by the migration runner or test suite) before server.js fires.
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL is not set in environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  // A background/idle client error should never crash the whole process.
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function getClient() {
  // For multi-statement transactions (BEGIN/COMMIT/ROLLBACK).
  return pool.connect();
}

module.exports = { pool, query, getClient };
