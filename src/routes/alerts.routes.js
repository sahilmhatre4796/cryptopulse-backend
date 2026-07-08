const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/alerts.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateCoinId, validatePositiveNumber } = require('../utils/validate');

router.use(requireAuth);
router.get('/',           ctrl.getAlerts);
router.post('/', validateBody({
  coin_id:      validateCoinId,
  condition:    (v) => ['above', 'below'].includes(v),
  target_price: (v) => validatePositiveNumber(Number(v)),
}), ctrl.createAlert);
router.patch('/:id/cancel', ctrl.cancelAlert);
router.delete('/:id',       ctrl.deleteAlert);

module.exports = router;
