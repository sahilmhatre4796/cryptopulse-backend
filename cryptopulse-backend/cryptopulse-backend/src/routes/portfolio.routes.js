const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/portfolio.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateCoinId, validateSymbol, validatePositiveNumber } = require('../utils/validate');

const holdingRules = {
  coin_id:   validateCoinId,
  symbol:    validateSymbol,
  name:      (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 120,
  amount:    (v) => validatePositiveNumber(Number(v)),
  buy_price: (v) => validatePositiveNumber(Number(v)),
};

router.use(requireAuth);
router.get('/',          ctrl.getHoldings);
router.get('/summary',   ctrl.getSummary);
router.post('/',         validateBody(holdingRules), ctrl.addHolding);
router.patch('/:id',     ctrl.updateHolding);
router.delete('/:id',    ctrl.deleteHolding);

module.exports = router;
