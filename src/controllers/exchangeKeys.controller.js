const db = require('../config/db');
const { encryptSecret, decryptSecret, maskApiKey } = require('../utils/crypto');

const ALLOWED_EXCHANGES = ['binance', 'bybit', 'coinbase', 'kraken', 'okx'];

async function getKeys(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, exchange, label, api_key_preview, created_at
       FROM exchange_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    // Note: api_secret_encrypted is intentionally excluded — the secret is
    // never surfaced via any GET endpoint after the initial add.
    res.json({ keys: result.rows });
  } catch (err) { next(err); }
}

async function addKey(req, res, next) {
  try {
    const { exchange, label, api_key, api_secret } = req.body;
    if (!ALLOWED_EXCHANGES.includes(exchange)) {
      return res.status(400).json({ error: `Unsupported exchange. Supported: ${ALLOWED_EXCHANGES.join(', ')}` });
    }

    const keyEncrypted = encryptSecret(api_key);
    const secretEncrypted = encryptSecret(api_secret);
    const keyPreview = maskApiKey(api_key);

    const result = await db.query(
      `INSERT INTO exchange_api_keys
         (user_id, exchange, label, api_key_encrypted, api_secret_encrypted, api_key_preview)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, exchange, label, api_key_preview, created_at`,
      [req.user.id, exchange, label.trim(), keyEncrypted, secretEncrypted, keyPreview]
    );
    res.status(201).json({ key: result.rows[0] });
  } catch (err) { next(err); }
}

async function deleteKey(req, res, next) {
  try {
    const result = await db.query(
      'DELETE FROM exchange_api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Key not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// Internal helper — used only by bot controller, never exposed as a route.
async function getDecryptedKey(userId, keyId) {
  const result = await db.query(
    'SELECT api_key_encrypted, api_secret_encrypted FROM exchange_api_keys WHERE id = $1 AND user_id = $2',
    [keyId, userId]
  );
  if (!result.rows[0]) return null;
  const { api_key_encrypted, api_secret_encrypted } = result.rows[0];
  return { apiKey: decryptSecret(api_key_encrypted), apiSecret: decryptSecret(api_secret_encrypted) };
}

module.exports = { getKeys, addKey, deleteKey, getDecryptedKey };
