const rateLimit = require('express-rate-limit');

// Login/register: 10 attempts per 15 minutes per IP. Tight enough to slow
// down brute-force/credential-stuffing, loose enough not to lock out a
// real user who fat-fingers their password a few times.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

// General API: generous, just enough to blunt scripted abuse.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

module.exports = { authLimiter, apiLimiter };
