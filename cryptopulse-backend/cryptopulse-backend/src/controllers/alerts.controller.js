const db = require('../config/db');

async function getAlerts(req, res, next) {
  try {
    const { status } = req.query;
    const allowed = ['active', 'triggered', 'canceled'];
    const filter = allowed.includes(status) ? status : null;
    const result = await db.query(
      `SELECT id, coin_id, condition, target_price, status, triggered_at, created_at
       FROM alerts
       WHERE user_id = $1 ${filter ? 'AND status = $2' : ''}
       ORDER BY created_at DESC`,
      filter ? [req.user.id, filter] : [req.user.id]
    );
    res.json({ alerts: result.rows });
  } catch (err) { next(err); }
}

async function createAlert(req, res, next) {
  try {
    const { coin_id, condition, target_price } = req.body;
    const result = await db.query(
      `INSERT INTO alerts (user_id, coin_id, condition, target_price)
       VALUES ($1, $2, $3, $4)
       RETURNING id, coin_id, condition, target_price, status, created_at`,
      [req.user.id, coin_id.toLowerCase().trim(), condition, Number(target_price)]
    );
    res.status(201).json({ alert: result.rows[0] });
  } catch (err) { next(err); }
}

async function cancelAlert(req, res, next) {
  try {
    const result = await db.query(
      `UPDATE alerts SET status = 'canceled'
       WHERE id = $1 AND user_id = $2 AND status = 'active'
       RETURNING id, status`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Alert not found or already resolved' });
    res.json({ alert: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteAlert(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM alerts WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Alert not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getAlerts, createAlert, cancelAlert, deleteAlert };
