// Integration tests — hit the real Express app with the real PostgreSQL DB.
// Run with: npm test

const http = require('http');
const { pool } = require('../src/config/db');

let server;
let base;
let accessToken;
let userId;
let refreshCookie;
let holdingId;
let botId;
let alertId;
let txnId;
let exchangeKeyId;

// ── Minimal HTTP helper ────────────────────────────────────────────────────
function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: server.address().port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(refreshCookie ? { Cookie: refreshCookie } : {}),
        ...headers,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        if (sc) refreshCookie = sc.find(c => c.startsWith('cp_refresh='));
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ── Test runner ────────────────────────────────────────────────────────────
const tests = [];
let passed = 0, failed = 0;

function test(name, fn) { tests.push({ name, fn }); }

async function run() {
  // Wipe test data so tests are idempotent
  await pool.query("DELETE FROM users WHERE email = 'integration@test.com'");

  const app = require('../src/server');
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
  console.log(`\nRunning integration tests against ${base}\n`);

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓  ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗  ${name}\n     ${err.message}`);
      failed++;
    }
  }

  await pool.query("DELETE FROM users WHERE email = 'integration@test.com'");
  await pool.end();
  server.close();

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

function assert(condition, msg) { if (!condition) throw new Error(msg); }

// ── Tests ──────────────────────────────────────────────────────────────────

test('GET /health returns ok', async () => {
  const r = await req('GET', '/health');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.body.status === 'ok', `expected status ok, got ${r.body.status}`);
  assert(r.body.db === 'connected', `DB not connected`);
});

test('POST /api/auth/register - validation rejects short password', async () => {
  const r = await req('POST', '/api/auth/register', { name: 'T', email: 'a@b.com', password: '123' });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});

test('POST /api/auth/register - creates user and returns token', async () => {
  const r = await req('POST', '/api/auth/register', { name: 'Integration Tester', email: 'integration@test.com', password: 'securepass123' });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.accessToken, 'no accessToken in response');
  assert(r.body.user.email === 'integration@test.com', 'email mismatch');
  assert(!r.body.user.password_hash, 'password_hash should not be returned');
  accessToken = r.body.accessToken;
  userId = r.body.user.id;
});

test('POST /api/auth/register - duplicate email returns 409', async () => {
  const r = await req('POST', '/api/auth/register', { name: 'Dupe', email: 'integration@test.com', password: 'securepass123' });
  assert(r.status === 409, `expected 409, got ${r.status}`);
});

test('GET /api/auth/me - returns current user', async () => {
  const r = await req('GET', '/api/auth/me');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.body.user.id === userId, 'user id mismatch');
  assert(r.body.user.tier === 'starter', 'new user should be on starter tier');
});

test('POST /api/auth/logout - clears cookie', async () => {
  const r = await req('POST', '/api/auth/logout');
  assert(r.status === 200, `expected 200, got ${r.status}`);
});

test('POST /api/auth/login - correct credentials', async () => {
  const r = await req('POST', '/api/auth/login', { email: 'INTEGRATION@test.com  ', password: 'securepass123' });
  assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.accessToken, 'no accessToken');
  accessToken = r.body.accessToken;
});

test('POST /api/auth/login - wrong password returns 401', async () => {
  const r = await req('POST', '/api/auth/login', { email: 'integration@test.com', password: 'wrongpassword' });
  assert(r.status === 401, `expected 401, got ${r.status}`);
});

test('POST /api/auth/refresh - rotates refresh token', async () => {
  const r = await req('POST', '/api/auth/refresh');
  assert(r.status === 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.accessToken, 'no new accessToken after refresh');
  accessToken = r.body.accessToken;
});

test('GET /api/auth/me - unauthorized without token', async () => {
  const savedToken = accessToken;
  accessToken = null;
  const r = await req('GET', '/api/auth/me');
  assert(r.status === 401, `expected 401, got ${r.status}`);
  accessToken = savedToken;
});

// Portfolio
test('GET /api/portfolio - returns empty holdings', async () => {
  const r = await req('GET', '/api/portfolio');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(Array.isArray(r.body.holdings), 'holdings should be array');
  assert(r.body.holdings.length === 0, 'should start empty');
});

test('POST /api/portfolio - adds a holding', async () => {
  const r = await req('POST', '/api/portfolio', { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', amount: 0.5, buy_price: 80000 });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.holding.coin_id === 'bitcoin', 'coin_id mismatch');
  holdingId = r.body.holding.id;
});

test('POST /api/portfolio - rejects Infinity amount', async () => {
  const r = await req('POST', '/api/portfolio', { coin_id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', amount: 1e400, buy_price: 80000 });
  assert(r.status === 400, `expected 400, got ${r.status}`);
});

test('GET /api/portfolio - returns added holding', async () => {
  const r = await req('GET', '/api/portfolio');
  assert(r.status === 200, `expected 200`);
  assert(r.body.holdings.length === 1, 'should have 1 holding');
});

test('PATCH /api/portfolio/:id - updates amount', async () => {
  const r = await req('PATCH', `/api/portfolio/${holdingId}`, { amount: 1.0 });
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(Number(r.body.holding.amount) === 1.0, 'amount not updated');
});

test('GET /api/portfolio/summary - returns aggregated holdings', async () => {
  const r = await req('GET', '/api/portfolio/summary');
  assert(r.status === 200, `expected 200`);
  assert(r.body.summary.length === 1, 'should have 1 coin in summary');
});

test('DELETE /api/portfolio/:id - removes holding', async () => {
  const r = await req('DELETE', `/api/portfolio/${holdingId}`);
  assert(r.status === 200, `expected 200`);
  assert(r.body.ok === true, 'expected ok');
});

// Watchlist
test('POST /api/watchlist - adds coin', async () => {
  const r = await req('POST', '/api/watchlist', { coin_id: 'ethereum' });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.item.coin_id === 'ethereum', 'coin_id mismatch');
});

test('POST /api/watchlist - duplicate returns 409', async () => {
  const r = await req('POST', '/api/watchlist', { coin_id: 'ethereum' });
  assert(r.status === 409, `expected 409, got ${r.status}`);
});

test('GET /api/watchlist - returns watchlist', async () => {
  const r = await req('GET', '/api/watchlist');
  assert(r.status === 200, `expected 200`);
  assert(r.body.watchlist.length === 1, 'should have 1 item');
});

test('DELETE /api/watchlist/ethereum - removes coin', async () => {
  const r = await req('DELETE', '/api/watchlist/ethereum');
  assert(r.status === 200, `expected 200`);
});

// Exchange keys
test('POST /api/exchange-keys - adds encrypted key', async () => {
  const r = await req('POST', '/api/exchange-keys', { exchange: 'binance', label: 'My Binance', api_key: 'testapikey12345678', api_secret: 'testsecret12345678901234567890' });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.key.api_key_preview, 'no key preview');
  assert(!r.body.key.api_key_encrypted, 'encrypted key should not be returned');
  exchangeKeyId = r.body.key.id;
});

test('GET /api/exchange-keys - secret fields not returned', async () => {
  const r = await req('GET', '/api/exchange-keys');
  assert(r.status === 200);
  const key = r.body.keys[0];
  assert(!key.api_key_encrypted, 'encrypted key should not be in GET response');
  assert(!key.api_secret_encrypted, 'encrypted secret should not be in GET response');
  assert(key.api_key_preview, 'preview should exist');
});

test('DELETE /api/exchange-keys/:id - removes key', async () => {
  const r = await req('DELETE', `/api/exchange-keys/${exchangeKeyId}`);
  assert(r.status === 200, `expected 200, got ${r.status}`);
});

// Alerts
test('POST /api/alerts - creates alert', async () => {
  const r = await req('POST', '/api/alerts', { coin_id: 'bitcoin', condition: 'above', target_price: 120000 });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.alert.status === 'active', 'alert should be active');
  alertId = r.body.alert.id;
});

test('GET /api/alerts - returns alerts', async () => {
  const r = await req('GET', '/api/alerts');
  assert(r.status === 200);
  assert(r.body.alerts.length >= 1, 'should have alerts');
});

test('PATCH /api/alerts/:id/cancel - cancels alert', async () => {
  const r = await req('PATCH', `/api/alerts/${alertId}/cancel`);
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.body.alert.status === 'canceled', 'status should be canceled');
});

// Bots (starter tier blocks creation)
test('POST /api/bots - starter tier blocked', async () => {
  const r = await req('POST', '/api/bots', { name: 'My Bot', strategy: 'dca' });
  assert(r.status === 403, `expected 403 (starter tier), got ${r.status}: ${JSON.stringify(r.body)}`);
});

// Transactions
test('POST /api/transactions - logs a trade', async () => {
  const r = await req('POST', '/api/transactions', { type: 'buy', coin_id: 'bitcoin', amount: 0.1, price: 100000 });
  assert(r.status === 201, `expected 201, got ${r.status}: ${JSON.stringify(r.body)}`);
  assert(r.body.transaction.type === 'buy', 'type mismatch');
  assert(Number(r.body.transaction.total) === 10000, `total should be 10000, got ${r.body.transaction.total}`);
  txnId = r.body.transaction.id;
});

test('GET /api/transactions - returns paginated history', async () => {
  const r = await req('GET', '/api/transactions?page=1');
  assert(r.status === 200);
  assert(r.body.transactions.length >= 1, 'should have transactions');
  assert(r.body.pagination.page === 1, 'pagination mismatch');
});

test('GET /api/transactions/stats - returns P&L summary', async () => {
  const r = await req('GET', '/api/transactions/stats');
  assert(r.status === 200);
  assert(Number(r.body.stats.total_trades) >= 1, 'should count trades');
});

// Subscription
test('GET /api/subscription - returns tier and features', async () => {
  const r = await req('GET', '/api/subscription');
  assert(r.status === 200, `expected 200, got ${r.status}`);
  assert(r.body.subscription.tier === 'starter', 'should be starter');
  assert(typeof r.body.features.bots === 'number', 'features.bots missing');
});

run();
