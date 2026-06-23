require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { pool } = require('./config/db');

// ── Route imports ────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const portfolioRoutes    = require('./routes/portfolio.routes');
const watchlistRoutes    = require('./routes/watchlist.routes');
const exchangeKeyRoutes  = require('./routes/exchangeKeys.routes');
const botRoutes          = require('./routes/bots.routes');
const alertRoutes        = require('./routes/alerts.routes');
const transactionRoutes  = require('./routes/transactions.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const marketRoutes       = require('./routes/market.routes');

const app = express();

// ── Security headers ─────────────────────────────────────────────────────
app.use(helmet());
app.set('trust proxy', 1);

// ── CORS — only allow the frontend origin(s) ────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} is not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use(apiLimiter);

// ── Health check (no auth, no rate limit, used by Render/Railway) ───────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

// ── API routes ────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/portfolio',     portfolioRoutes);
app.use('/api/watchlist',     watchlistRoutes);
app.use('/api/exchange-keys', exchangeKeyRoutes);
app.use('/api/bots',          botRoutes);
app.use('/api/alerts',        alertRoutes);
app.use('/api/transactions',  transactionRoutes);
app.use('/api/subscription',  subscriptionRoutes);
app.use('/api/market',        marketRoutes);

// ── 404 + error handling ──────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 4000;

async function start() {
  // Run migrations automatically on every startup. This is safe because
  // every statement in schema.sql uses CREATE TABLE IF NOT EXISTS / CREATE
  // OR REPLACE — re-running it never breaks existing data.
  console.log('Running database migrations...');
  try {
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Migrations complete.');
  } catch (err) {
    console.error('FATAL: Migration failed:', err.message);
    process.exit(1);
  }

  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connected');
  } catch (err) {
    console.error('FATAL: Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`CryptoPulse API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

start();

module.exports = app; // exported for testing
