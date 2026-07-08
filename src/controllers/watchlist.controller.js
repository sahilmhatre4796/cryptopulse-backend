const db = require('../config/db');

async function getWatchlist(req, res, next) {
  try {
    const result = await db.query(
      'SELECT id, coin_id, added_at FROM watchlist_items WHERE user_id = $1 ORDER BY added_at DESC',
      [req.user.id]
    );
    res.json({ watchlist: result.rows });
  } catch (err) { next(err); }
}

async function addToWatchlist(req, res, next) {
  try {
    const coin_id = req.body.coin_id.toLowerCase().trim();
    const result = await db.query(
      `INSERT INTO watchlist_items (user_id, coin_id) VALUES ($1, $2)
       ON CONFLICT (user_id, coin_id) DO NOTHING
       RETURNING id, coin_id, added_at`,
      [req.user.id, coin_id]
    );
    if (!result.rows[0]) return res.status(409).json({ error: 'Already in watchlist' });
    res.status(201).json({ item: result.rows[0] });
  } catch (err) { next(err); }
}

async function removeFromWatchlist(req, res, next) {
  try {
    const coin_id = req.params.coinId.toLowerCase();
    const result = await db.query(
      'DELETE FROM watchlist_items WHERE user_id = $1 AND coin_id = $2 RETURNING id',
      [req.user.id, coin_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not in watchlist' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist };
