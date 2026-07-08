const db = require('../config/db');
const {
  hashPassword, verifyPassword,
  signAccessToken, generateRefreshToken, hashRefreshToken,
} = require('../utils/crypto');

const REFRESH_COOKIE_NAME = 'cp_refresh';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const { raw, hash, expiresAt } = generateRefreshToken();
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, hash, expiresAt]
  );
  res.cookie(REFRESH_COOKIE_NAME, raw, REFRESH_COOKIE_OPTS);
  return accessToken;
}

function toSafeUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
}

async function register(req, res, next) {
  try {
    const name = req.body.name.trim();
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role, created_at',
      [name, email, passwordHash]
    );
    const user = result.rows[0];

    await db.query('INSERT INTO subscriptions (user_id, tier, status) VALUES ($1, $2, $3)', [user.id, 'starter', 'active']);

    const accessToken = await issueSession(res, user);
    res.status(201).json({ user: toSafeUser(user), accessToken });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    // Always run a bcrypt compare even on a missing user (against a dummy
    // hash) so response timing doesn't reveal whether the email exists.
    const dummyHash = '$2a$12$CwTycUXWue0Thq9StjUM0uJ8I/0Ozqx0KurOoz1OkKgWgHF2Hdkjy';
    const valid = await verifyPassword(password, user ? user.password_hash : dummyHash);
    if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' });

    const accessToken = await issueSession(res, user);
    res.json({ user: toSafeUser(user), accessToken });
  } catch (err) { next(err); }
}

async function refresh(req, res, next) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!raw) return res.status(401).json({ error: 'No refresh token' });

    const hash = hashRefreshToken(raw);
    const result = await db.query(
      `SELECT rt.*, u.id as uid, u.name, u.email, u.role, u.created_at
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked = false AND rt.expires_at > now()`,
      [hash]
    );
    const row = result.rows[0];
    if (!row) { res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' }); return res.status(401).json({ error: 'Invalid or expired session' }); }

    // Rotate: revoke the used token, issue a brand new one.
    await db.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [row.id]);
    const user = { id: row.uid, name: row.name, email: row.email, role: row.role, created_at: row.created_at };
    const accessToken = await issueSession(res, user);
    res.json({ user: toSafeUser(user), accessToken });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE_NAME];
    if (raw) {
      const hash = hashRefreshToken(raw);
      await db.query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [hash]);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at, s.tier, s.status as subscription_status
       FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
}

module.exports = { register, login, refresh, logout, me };
