// Minimal validation helpers. No external dependency — every rule is
// explicit here so it's easy to audit exactly what's allowed through.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COIN_ID_RE = /^[a-z0-9-]{1,80}$/; // CoinGecko-style slugs: lowercase, digits, hyphens
const SYMBOL_RE = /^[A-Za-z0-9]{1,20}$/;

function isString(v) { return typeof v === 'string'; }
function isFiniteNumber(v) { return typeof v === 'number' && Number.isFinite(v); }

function validateEmail(email) {
  if (!isString(email)) return false;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.length <= 120 && EMAIL_RE.test(trimmed);
}

function validateName(name) {
  return isString(name) && name.trim().length > 0 && name.trim().length <= 60;
}

function validatePassword(password) {
  return isString(password) && password.length >= 6 && password.length <= 128;
}

function validateCoinId(coinId) {
  return isString(coinId) && COIN_ID_RE.test(coinId);
}

function validateSymbol(symbol) {
  return isString(symbol) && SYMBOL_RE.test(symbol);
}

function validatePositiveNumber(n, max = 1e15) {
  return isFiniteNumber(n) && n > 0 && n <= max;
}

function validateEnum(value, allowed) {
  return isString(value) && allowed.includes(value);
}

// Wraps a validator function as Express middleware. `rules` is an object of
// { fieldName: validatorFn }. On failure, responds 400 with the first
// failing field name — never leaks internal details.
function validateBody(rules) {
  return (req, res, next) => {
    for (const [field, validator] of Object.entries(rules)) {
      if (!validator(req.body?.[field])) {
        return res.status(400).json({ error: `Invalid or missing field: ${field}` });
      }
    }
    next();
  };
}

module.exports = {
  validateEmail, validateName, validatePassword,
  validateCoinId, validateSymbol, validatePositiveNumber, validateEnum,
  validateBody,
};
