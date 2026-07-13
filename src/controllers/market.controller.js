// Market data proxy — all external API calls go through here
// Frontend gets clean JSON, never hits external APIs directly

const COINGECKO  = 'https://api.coingecko.com/api/v3';
const FEAR_GREED = 'https://api.alternative.me/fng/?limit=1';

// Free crypto news RSS feeds — no API key, no rate limit, always free
const NEWS_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
  'https://decrypt.co/feed',
  'https://cryptobriefing.com/feed/',
];

const cache = new Map();
const TTL = {
  coins:    30  * 1000,
  global:   60  * 1000,
  history:  60  * 1000,
  feargreed:300 * 1000,
  news:     600 * 1000,  // 10 minutes for news
  trending: 300 * 1000,
};

const HEADERS = { 'User-Agent': 'CryptoPulse/1.0', 'Accept': 'application/json, text/xml' };

async function fetchWithCache(key, url, ttl) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw Object.assign(new Error(`Upstream ${res.status}`), { status: 502 });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  cache.set(key, { data, ts: Date.now() });
  return data;
}

// ── Parse RSS XML into clean article objects ──────────────────────────────
function parseRSS(xml, sourceName) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title');
    const url   = get('link') || get('guid');
    const date  = get('pubDate') || get('dc:date');
    const desc  = get('description').replace(/<[^>]+>/g, '').slice(0, 200);

    if (title && url) {
      items.push({ title, url, description: desc, source: sourceName, published_at: date ? new Date(date).toISOString() : new Date().toISOString() });
    }
  }
  return items;
}

// GET /api/market/news — returns latest 10 articles from free RSS feeds
async function getNews(req, res, next) {
  try {
    const hit = cache.get('news_rss');
    if (hit && Date.now() - hit.ts < TTL.news) return res.json(hit.data);

    const sourceNames = ['CoinDesk', 'CoinTelegraph', 'Decrypt', 'CryptoBriefing'];

    // Fetch all feeds in parallel, ignore failures gracefully
    const results = await Promise.allSettled(
      NEWS_FEEDS.map((url, i) =>
        fetch(url, { headers: { 'User-Agent': 'CryptoPulse/1.0' }, signal: AbortSignal.timeout(8000) })
          .then(r => r.ok ? r.text() : Promise.reject(r.status))
          .then(xml => parseRSS(xml, sourceNames[i]))
          .catch(() => [])
      )
    );

    // Merge all articles, sort by date, return latest 10
    const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    all.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    const latest10 = all.slice(0, 10);

    const response = { articles: latest10, count: latest10.length, fetched_at: new Date().toISOString() };
    cache.set('news_rss', { data: response, ts: Date.now() });
    res.json(response);
  } catch (err) { next(err); }
}

// GET /api/market/coins?n=20
async function getTopCoins(req, res, next) {
  try {
    const n = Math.min(Math.max(parseInt(req.query.n) || 20, 1), 100);
    const data = await fetchWithCache(`coins_${n}`, `${COINGECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${n}&page=1&sparkline=true`, TTL.coins);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/global
async function getGlobal(req, res, next) {
  try {
    const data = await fetchWithCache('global', `${COINGECKO}/global`, TTL.global);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/coin/:id/history?days=7
async function getCoinHistory(req, res, next) {
  try {
    const id = req.params.id;
    if (!/^[a-z0-9-]{1,80}$/.test(id)) return res.status(400).json({ error: 'Invalid coin id' });
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);
    const data = await fetchWithCache(`history_${id}_${days}`, `${COINGECKO}/coins/${id}/market_chart?vs_currency=usd&days=${days}`, TTL.history);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/fear-greed
async function getFearGreed(req, res, next) {
  try {
    const data = await fetchWithCache('feargreed', FEAR_GREED, TTL.feargreed);
    res.json(data);
  } catch (err) { next(err); }
}

// GET /api/market/trending
async function getTrending(req, res, next) {
  try {
    const data = await fetchWithCache('trending', `${COINGECKO}/search/trending`, TTL.trending);
    res.json(data);
  } catch (err) { next(err); }
}

module.exports = { getTopCoins, getGlobal, getCoinHistory, getFearGreed, getNews, getTrending };
