-- CryptoPulse PostgreSQL schema
-- Run via: npm run migrate (see src/db/migrate.js)
-- All tables use UUID primary keys (gen_random_uuid) instead of sequential
-- integers, so IDs can't be enumerated/guessed by walking 1,2,3...

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(60) NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── Refresh tokens ───────────────────────────────────────────────────────
-- Stored hashed (never plaintext) so a stolen DB dump can't be replayed.
-- One row per issued refresh token; rotated and revoked on logout/refresh.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- ── Subscriptions / billing ──────────────────────────────────────────────
-- Schema-ready for Stripe; stripe_* columns stay NULL until billing is
-- actually wired up. tier/status drive feature gating in the meantime.
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tier                    VARCHAR(20) NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'pro', 'elite')),
  status                  VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  current_period_end      TIMESTAMPTZ,
  stripe_customer_id      VARCHAR(120),
  stripe_subscription_id  VARCHAR(120),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Portfolio holdings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id     VARCHAR(80) NOT NULL,
  symbol      VARCHAR(20) NOT NULL,
  name        VARCHAR(120) NOT NULL,
  amount      NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  buy_price   NUMERIC(18,8) NOT NULL CHECK (buy_price > 0),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holdings_user ON portfolio_holdings (user_id);

-- ── Watchlist ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id     VARCHAR(80) NOT NULL,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, coin_id)
);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist_items (user_id);

-- ── Exchange API keys ────────────────────────────────────────────────────
-- api_key/secret are stored AES-256-GCM encrypted (see utils/crypto.js),
-- never in plaintext. The secret is never returned by any API response
-- after creation — only a masked preview (e.g. "sk_live_***ab12").
CREATE TABLE IF NOT EXISTS exchange_api_keys (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange               VARCHAR(40) NOT NULL,
  label                  VARCHAR(60) NOT NULL,
  api_key_encrypted      TEXT NOT NULL,
  api_secret_encrypted   TEXT NOT NULL,
  api_key_preview        VARCHAR(20) NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exchange_keys_user ON exchange_api_keys (user_id);

-- ── Trading bots ─────────────────────────────────────────────────────────
-- Config + status tracking only. This does NOT execute live trades against
-- an exchange — that is a separate, deliberately out-of-scope integration
-- (see README). "status" reflects what the user has toggled, not a live
-- execution engine.
CREATE TABLE IF NOT EXISTS trading_bots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(60) NOT NULL,
  strategy    VARCHAR(40) NOT NULL CHECK (strategy IN ('momentum', 'dca', 'arbitrage', 'custom')),
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      VARCHAR(20) NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bots_user ON trading_bots (user_id);

-- ── Price alerts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coin_id       VARCHAR(80) NOT NULL,
  condition     VARCHAR(10) NOT NULL CHECK (condition IN ('above', 'below')),
  target_price  NUMERIC(18,8) NOT NULL CHECK (target_price > 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'canceled')),
  triggered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts (user_id);

-- ── Transactions ─────────────────────────────────────────────────────────
-- Manually logged or bot-attributed transaction history. Not a live
-- exchange order book — see README for what's needed to make this real.
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id      UUID REFERENCES trading_bots(id) ON DELETE SET NULL,
  type        VARCHAR(20) NOT NULL CHECK (type IN ('buy', 'sell', 'deposit', 'withdrawal')),
  coin_id     VARCHAR(80) NOT NULL,
  amount      NUMERIC(24,8) NOT NULL CHECK (amount > 0),
  price       NUMERIC(18,8) NOT NULL CHECK (price > 0),
  total       NUMERIC(24,8) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions (user_id);

-- ── updated_at auto-touch trigger (reused across tables that track it) ────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_bots_updated_at ON trading_bots;
CREATE TRIGGER trg_bots_updated_at BEFORE UPDATE ON trading_bots
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
