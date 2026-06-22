// Market data proxy — the frontend calls these endpoints instead of hitting
// CoinGecko/CryptoCompare directly. Benefits:
//   1. No browser CORS issues (server-to-server has no origin restrictions)
//   2. Server-side caching so 10 users hitting the dashboard don't fire
//      10 separate CoinGecko requests — they all share one cached response
//   3. CoinGecko rate limit (30 req/min free tier) is shared by the server,
//      not multiplied by every browser tab

const COINGECKO  = 'https://api.coingecko.com/api/v3';
const FEAR_GREED = 'https://api.alternative.me/fng/?limit=1';
const NEWS_URL   = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=popular';

// In-memory cache — TTLs are deliberately generous to stay within free API limits
const cache = new Map();
const TTL = {
  coins:    30  * 1000,   // 30 seconds
  global:   60  * 1000,   // 1 minute
  history:  60  * 1000,   // 1 minute
  feargreed:300 * 1000,   // 5 minutes
  news:     300 * 1000,   // 5 minutes
  trending: 300 * 1000,   // 5 minutes
};

const HEADERS = {
  'User-Agent': 'CryptoPulse/1.0',
  'Accept': 'application/json',
};

async function fetchCached(key, url, ttl) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const err = new Error(`Upstream API error: ${res.status}`);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }
  const data = await res.json();
  cache.set(key, { data, ts: Date.now() });
  return data;
}

// GET /api/market/coins?n=20
async function getTopCoins(req, res, next) {
  try {
    const n = Math.min(Math.max(parseInt(req.query.n) || 20, 1), 100);
    const data = await fetchCached(
      `coins_${n}`,
      `${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1&sparkline=true`,
      TTL.coins
    );
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/global
async function getGlobal(req, res, next) {
  try {
    const data = await fetchCached('global', `${COINGECKO}/global`, TTL.global);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/coin/:id/history?days=7
async function getCoinHistory(req, res, next) {
  try {
    const id = req.params.id;
    if (!/^[a-z0-9-]{1,80}$/.test(id)) return res.status(400).json({ error: 'Invalid coin id' });
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);
    const data = await fetchCached(
      `history_${id}_${days}`,
      `${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
      TTL.history
    );
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/fear-greed
async function getFearGreed(req, res, next) {
  try {
    const data = await fetchCached('feargreed', FEAR_GREED, TTL.feargreed);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/news
async function getNews(req, res, next) {
  try {
    const data = await fetchCached('news', NEWS_URL, TTL.news);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/trending
async function getTrending(req, res, next) {
  try {
    const data = await fetchCached('trending', `${COINGECKO}/search/trending`, TTL.trending);
    res.json(data);
  } catch (err) { next(err); }
}

module.exports = { getTopCoins, getGlobal, getCoinHistory, getFearGreed, getNews, getTrending };
