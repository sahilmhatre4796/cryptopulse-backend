# CryptoPulse — Full-Stack Deployment Guide

## Architecture
```
Netlify (static frontend) ──HTTP──▶ Render/Railway (Express API) ──▶ PostgreSQL
```

---

## Step 1 — PostgreSQL Database

### Option A: Render (recommended, free tier available)
1. Go to **render.com** → New → PostgreSQL
2. Give it a name, pick the free tier, click Create
3. Wait ~60 seconds, then copy the **External Database URL** — it looks like:
   `postgresql://user:password@host/dbname`
4. Save this as your `DATABASE_URL`

### Option B: Supabase (also free)
1. Go to **supabase.com** → New project
2. Settings → Database → Connection String → URI tab
3. Copy the URI (replace `[YOUR-PASSWORD]` with your project password)

---

## Step 2 — Generate Secrets

Run these in your terminal (Node.js required):

```bash
# JWT secrets (run twice, use different values for each)
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"

# Encryption key for exchange API keys (must be exactly 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Save all three values — you need them in Step 3.

---

## Step 3 — Deploy Backend to Render

1. Push `cryptopulse-backend/` to a GitHub repository
2. Go to **render.com** → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. Add these Environment Variables (Settings → Environment):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your PostgreSQL URL from Step 1 |
| `DATABASE_SSL` | `true` |
| `JWT_ACCESS_SECRET` | First random string from Step 2 |
| `JWT_REFRESH_SECRET` | Second random string from Step 2 |
| `ENCRYPTION_KEY` | Third random string from Step 2 |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://your-site.netlify.app` (update after Step 4) |
| `PORT` | `4000` |

6. Click **Deploy**. Wait for the build to finish.
7. Copy your service URL — it looks like `https://cryptopulse-api.onrender.com`
8. **Run migrations**: In Render → your service → Shell tab:
   ```bash
   node src/db/migrate.js
   ```

---

## Step 4 — Deploy Frontend to Netlify

1. Open `cryptopulse-netlify/assets/api-client.js`
2. Find this line and replace the localhost URL with your Render URL:
   ```js
   // BEFORE:
   window.CP_API_BASE = 'http://localhost:4000';
   // AFTER:
   window.CP_API_BASE = 'https://cryptopulse-api.onrender.com';
   ```
   This same change is needed in: `login.html`, `dashboard.html`,
   `markets.html`, `portfolio.html`, `news.html` (search for `CP_API_BASE`)

3. Unzip `cryptopulse-netlify.zip`, make the URL changes above
4. Go to **netlify.com** → Add new site → Deploy manually
5. Drag the `cryptopulse-netlify` folder into the drop zone
6. Copy your Netlify URL (e.g. `https://cryptopulse-abc123.netlify.app`)

---

## Step 5 — Wire CORS

Go back to Render → your backend service → Environment:
- Update `CORS_ORIGINS` to your actual Netlify URL (no trailing slash)
- Redeploy the backend (Render does this automatically on env var changes)

---

## Step 6 — Smoke Test

1. Open your Netlify URL
2. Click Get Started → Register a new account
3. Log in → Dashboard should load with live market data
4. Go to Portfolio → Add a holding → confirm it persists after page refresh
5. Go to Markets → Star some coins → confirm they appear in Watchlist filter
6. Log out → log back in → everything should be exactly where you left it

---

## Local Development

```bash
# Terminal 1 — backend
cd cryptopulse-backend
cp .env.example .env     # Fill in the values
npm install
node src/db/migrate.js   # Run once to create tables
npm run dev              # Starts on port 4000

# Terminal 2 — frontend (any static server works)
cd cryptopulse-netlify
python3 -m http.server 3000
# Open http://localhost:3000
```

---

## What's Scope for Later

| Feature | What's built | What's next |
|---|---|---|
| Subscriptions | Schema + tier gating + Stripe stubs | Wire Stripe webhooks |
| Exchange keys | Encrypted storage + CRUD API | Connect to Binance/Bybit SDK to fetch live balances |
| Trading bots | Config + status tracking + P&L query | Build the actual execution engine |
| Alerts | DB records + state machine | Add a polling worker or cron job that checks prices and triggers alerts |

---

## Running Tests

```bash
cd cryptopulse-backend
npm test    # 32 integration tests against a real PostgreSQL instance
```
