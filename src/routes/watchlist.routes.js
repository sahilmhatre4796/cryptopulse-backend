const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/watchlist.controller');
const { requireAuth } = require('../middleware/auth');
const { validateBody, validateCoinId } = require('../utils/validate');

router.use(requireAuth);
router.get('/',                ctrl.getWatchlist);
router.post('/',               validateBody({ coin_id: validateCoinId }), ctrl.addToWatchlist);
router.delete('/:coinId',      ctrl.removeFromWatchlist);

module.exports = router;
