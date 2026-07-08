const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateName, validateEmail, validatePassword } = require('../utils/validate');

router.post('/register', authLimiter, validateBody({ name: validateName, email: validateEmail, password: validatePassword }), ctrl.register);
router.post('/login', authLimiter, validateBody({ email: validateEmail, password: (v) => typeof v === 'string' && v.length > 0 }), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);

module.exports = router;
