const db = require('../config/db');

const ALLOWED_STRATEGIES = ['momentum', 'dca', 'arbitrage', 'custom'];
const MAX_BOTS_BY_TIER = { starter: 0, pro: 3, elite: 999 };

async function getUserTier(userId) {
  const result = await db.query(
    "SELECT tier FROM subscriptions WHERE user_id = $1 AND status = 'active'",
    [userId]
  );
  return result.rows[0]?.tier || 'starter';
}

async function getBots(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, name, strategy, config, status, created_at, updated_at
       FROM trading_bots WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ bots: result.rows });
  } catch (err) { next(err); }
}

async function createBot(req, res, next) {
  try {
    const tier = await getUserTier(req.user.id);
    const maxBots = MAX_BOTS_BY_TIER[tier] ?? 0;

    if (maxBots === 0) {
      return res.status(403).json({ error: 'Upgrade to Pro or Elite to create trading bots.' });
    }

    const countResult = await db.query(
      'SELECT COUNT(*) FROM trading_bots WHERE user_id = $1',
      [req.user.id]
    );
    if (parseInt(countResult.rows[0].count) >= maxBots) {
      return res.status(403).json({ error: `Your plan allows a maximum of ${maxBots} bots. Upgrade for more.` });
    }

    const { name, strategy, config = {} } = req.body;
    if (!ALLOWED_STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: `Invalid strategy. Allowed: ${ALLOWED_STRATEGIES.join(', ')}` });
    }

    const result = await db.query(
      `INSERT INTO trading_bots (user_id, name, strategy, config, status)
       VALUES ($1, $2, $3, $4, 'paused')
       RETURNING id, name, strategy, config, status, created_at, updated_at`,
      [req.user.id, name.trim(), strategy, JSON.stringify(config)]
    );
    res.status(201).json({ bot: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateBot(req, res, next) {
  try {
    const { name, config } = req.body;
    const result = await db.query(
      `UPDATE trading_bots
       SET name = COALESCE($1, name),
           config = COALESCE($2, config)
       WHERE id = $3 AND user_id = $4
       RETURNING id, name, strategy, config, status, created_at, updated_at`,
      [name?.trim() || null, config ? JSON.stringify(config) : null, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Bot not found' });
    res.json({ bot: result.rows[0] });
  } catch (err) { next(err); }
}

async function setBotStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: "Status must be 'active' or 'paused'" });
    }
    const result = await db.query(
      `UPDATE trading_bots SET status = $1
       WHERE id = $2 AND user_id = $3
       RETURNING id, name, status, updated_at`,
      [status, req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Bot not found' });
    res.json({ bot: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteBot(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM trading_bots WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Bot not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getBotStats(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         t.bot_id,
         COUNT(*) FILTER (WHERE t.type = 'buy') AS total_buys,
         COUNT(*) FILTER (WHERE t.type = 'sell') AS total_sells,
         COALESCE(SUM(t.total) FILTER (WHERE t.type = 'sell'), 0) -
         COALESCE(SUM(t.total) FILTER (WHERE t.type = 'buy'), 0) AS realized_pnl,
         MAX(t.created_at) AS last_trade_at
       FROM transactions t
       WHERE t.user_id = $1 AND t.bot_id = $2 AND t.status = 'completed'
       GROUP BY t.bot_id`,
      [req.user.id, req.params.id]
    );
    res.json({ stats: result.rows[0] || null });
  } catch (err) { next(err); }
}

module.exports = { getBots, createBot, updateBot, setBotStatus, deleteBot, getBotStats };
