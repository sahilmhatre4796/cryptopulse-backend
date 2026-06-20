const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/exchangeKeys.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../utils/validate');

const keyRules = {
  exchange:   (v) => typeof v === 'string' && v.trim().length > 0,
  label:      (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60,
  api_key:    (v) => typeof v === 'string' && v.trim().length >= 8 && v.trim().length <= 256,
  api_secret: (v) => typeof v === 'string' && v.trim().length >= 8 && v.trim().length <= 512,
};

router.use(requireAuth);
router.get('/',      ctrl.getKeys);
router.post('/',     validateBody(keyRules), ctrl.addKey);
router.delete('/:id', ctrl.deleteKey);

module.exports = router;
