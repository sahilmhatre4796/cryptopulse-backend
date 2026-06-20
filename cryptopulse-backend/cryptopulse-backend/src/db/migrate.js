// Simple migration runner: applies schema.sql in full. Every statement in
// that file uses CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE / DROP
// TRIGGER IF EXISTS, so re-running this is always safe (idempotent) — no
// migration-tracking table needed for a project this size.

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('FATAL: DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false });
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    await pool.query(sql);
    console.log('Migration complete: schema is up to date.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
