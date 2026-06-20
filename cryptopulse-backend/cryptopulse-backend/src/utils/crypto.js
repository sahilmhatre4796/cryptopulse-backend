const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ── Password hashing ────────────────────────────────────────────────────
const BCRYPT_COST = 12;
async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ── JWT access/refresh tokens ───────────────────────────────────────────
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function requireSecret(name) {
  const val = process.env[name];
  if (!val || val.length < 32) {
    throw new Error(`FATAL: ${name} must be set in environment variables and be at least 32 characters long.`);
  }
  return val;
}

function signAccessToken(user) {
  const secret = requireSecret('JWT_ACCESS_SECRET');
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, secret, { expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(token) {
  const secret = requireSecret('JWT_ACCESS_SECRET');
  return jwt.verify(token, secret);
}

// Refresh tokens are random opaque strings (not JWTs) — we store only a
// SHA-256 hash of them in the database, so a stolen DB dump alone can't be
// replayed as a valid session.
function generateRefreshToken() {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  return { raw, hash, expiresAt };
}

function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// ── AES-256-GCM encryption for exchange API keys ───────────────────────
// ENCRYPTION_KEY must be a 32-byte value, base64 or hex encoded, set as an
// environment variable. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('FATAL: ENCRYPTION_KEY is not set in environment variables.');
  let key;
  try {
    key = Buffer.from(raw, raw.length === 64 ? 'hex' : 'base64');
  } catch {
    throw new Error('FATAL: ENCRYPTION_KEY is not valid base64/hex.');
  }
  if (key.length !== 32) throw new Error('FATAL: ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

function encryptSecret(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Store iv + authTag + ciphertext together, base64-encoded, so a single
  // text column can hold everything needed to decrypt later.
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptSecret(encoded) {
  const key = getEncryptionKey();
  const data = Buffer.from(encoded, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

function maskApiKey(apiKey) {
  if (apiKey.length <= 8) return '***';
  return apiKey.slice(0, 4) + '***' + apiKey.slice(-4);
}

module.exports = {
  hashPassword, verifyPassword,
  signAccessToken, verifyAccessToken,
  generateRefreshToken, hashRefreshToken,
  encryptSecret, decryptSecret, maskApiKey,
};
