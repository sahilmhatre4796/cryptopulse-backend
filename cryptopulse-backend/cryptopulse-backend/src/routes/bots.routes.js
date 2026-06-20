const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bots.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody } = require('../utils/validate');

router.use(requireAuth);
router.get('/',             ctrl.getBots);
router.post('/',            validateBody({
  name:     (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 60,
  strategy: (v) => typeof v === 'string' && v.length > 0,
}), ctrl.createBot);
router.patch('/:id',        ctrl.updateBot);
router.patch('/:id/status', ctrl.setBotStatus);
router.get('/:id/stats',    ctrl.getBotStats);
router.delete('/:id',       ctrl.deleteBot);

module.exports = router;
