const db = require('../config/db');

async function getHoldings(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, coin_id, symbol, name, amount, buy_price, added_at
       FROM portfolio_holdings WHERE user_id = $1 ORDER BY added_at DESC`,
      [req.user.id]
    );
    res.json({ holdings: result.rows });
  } catch (err) { next(err); }
}

async function addHolding(req, res, next) {
  try {
    const { coin_id, symbol, name, amount, buy_price } = req.body;
    const result = await db.query(
      `INSERT INTO portfolio_holdings (user_id, coin_id, symbol, name, amount, buy_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, coin_id, symbol, name, amount, buy_price, added_at`,
      [req.user.id, coin_id.toLowerCase().trim(), symbol.toUpperCase().trim(),
       name.trim(), Number(amount), Number(buy_price)]
    );
    res.status(201).json({ holding: result.rows[0] });
  } catch (err) { next(err); }
}

async function updateHolding(req, res, next) {
  try {
    const { amount, buy_price } = req.body;
    const result = await db.query(
      `UPDATE portfolio_holdings
       SET amount = COALESCE($1, amount), buy_price = COALESCE($2, buy_price)
       WHERE id = $3 AND user_id = $4
       RETURNING id, coin_id, symbol, name, amount, buy_price, added_at`,
      [amount != null ? Number(amount) : null,
       buy_price != null ? Number(buy_price) : null,
       req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Holding not found' });
    res.json({ holding: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteHolding(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM portfolio_holdings WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Holding not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function getSummary(req, res, next) {
  try {
    const result = await db.query(
      `SELECT coin_id, symbol, name,
              SUM(amount) AS total_amount,
              AVG(buy_price) AS avg_buy_price,
              SUM(amount * buy_price) AS total_cost
       FROM portfolio_holdings WHERE user_id = $1
       GROUP BY coin_id, symbol, name
       ORDER BY total_cost DESC`,
      [req.user.id]
    );
    res.json({ summary: result.rows });
  } catch (err) { next(err); }
}

module.exports = { getHoldings, addHolding, updateHolding, deleteHolding, getSummary };
