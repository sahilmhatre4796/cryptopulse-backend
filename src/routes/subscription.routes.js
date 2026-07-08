const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscription.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/',       requireAuth, ctrl.getSubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.stripeWebhook);

module.exports = router;
