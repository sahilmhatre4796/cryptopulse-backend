const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/transactions.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateCoinId, validatePositiveNumber, validateEnum } = require('../utils/validate');

const TXN_TYPES = ['buy', 'sell', 'deposit', 'withdrawal'];

router.use(requireAuth);
router.get('/',       ctrl.getTransactions);
router.get('/stats',  ctrl.getTransactionStats);
router.post('/', validateBody({
  type:     (v) => validateEnum(v, TXN_TYPES),
  coin_id:  validateCoinId,
  amount:   (v) => validatePositiveNumber(Number(v)),
  price:    (v) => validatePositiveNumber(Number(v)),
}), ctrl.createTransaction);

module.exports = router;
