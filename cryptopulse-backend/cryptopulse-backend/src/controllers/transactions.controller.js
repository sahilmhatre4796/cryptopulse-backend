const db = require('../config/db');

const PAGE_SIZE = 20;

async function getTransactions(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const { type, coin_id, bot_id } = req.query;

    const conditions = ['t.user_id = $1'];
    const params = [req.user.id];
    let p = 2;

    if (type && ['buy', 'sell', 'deposit', 'withdrawal'].includes(type)) {
      conditions.push(`t.type = $${p++}`);
      params.push(type);
    }
    if (coin_id && /^[a-z0-9-]{1,80}$/.test(coin_id)) {
      conditions.push(`t.coin_id = $${p++}`);
      params.push(coin_id);
    }
    if (bot_id && /^[0-9a-f-]{36}$/.test(bot_id)) {
      conditions.push(`t.bot_id = $${p++}`);
      params.push(bot_id);
    }

    const where = conditions.join(' AND ');
    const [rowsResult, countResult] = await Promise.all([
      db.query(
        `SELECT t.id, t.type, t.coin_id, t.amount, t.price, t.total, t.status, t.created_at,
                b.name AS bot_name
         FROM transactions t LEFT JOIN trading_bots b ON b.id = t.bot_id
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        params
      ),
      db.query(`SELECT COUNT(*) FROM transactions t WHERE ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      transactions: rowsResult.rows,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) },
    });
  } catch (err) { next(err); }
}

async function createTransaction(req, res, next) {
  try {
    const { type, coin_id, amount, price, bot_id = null, status = 'completed' } = req.body;
    const total = Number(amount) * Number(price);
    const result = await db.query(
      `INSERT INTO transactions (user_id, bot_id, type, coin_id, amount, price, total, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, type, coin_id, amount, price, total, status, created_at`,
      [req.user.id, bot_id || null, type, coin_id.toLowerCase().trim(),
       Number(amount), Number(price), total, status]
    );
    res.status(201).json({ transaction: result.rows[0] });
  } catch (err) { next(err); }
}

async function getTransactionStats(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) AS total_trades,
         COUNT(*) FILTER (WHERE type = 'buy') AS total_buys,
         COUNT(*) FILTER (WHERE type = 'sell') AS total_sells,
         COALESCE(SUM(total) FILTER (WHERE type = 'buy'), 0)  AS total_spent,
         COALESCE(SUM(total) FILTER (WHERE type = 'sell'), 0) AS total_received,
         COALESCE(SUM(total) FILTER (WHERE type = 'sell'), 0) -
         COALESCE(SUM(total) FILTER (WHERE type = 'buy'), 0)  AS realized_pnl
       FROM transactions
       WHERE user_id = $1 AND status = 'completed'`,
      [req.user.id]
    );
    res.json({ stats: result.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { getTransactions, createTransaction, getTransactionStats };
