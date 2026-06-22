const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/market.controller');

// All market data routes are intentionally PUBLIC — no requireAuth.
// CoinGecko prices are public information; requiring login to see them
// would break the marketing landing page and make the app feel slow.
router.get('/coins',              ctrl.getTopCoins);
router.get('/global',             ctrl.getGlobal);
router.get('/coin/:id/history',   ctrl.getCoinHistory);
router.get('/fear-greed',         ctrl.getFearGreed);
router.get('/news',               ctrl.getNews);
router.get('/trending',           ctrl.getTrending);

module.exports = router;
