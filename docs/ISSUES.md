# Atlas — Issues, Fixes & Feature Backlog

A review of the Atlas codebase (Flask backend + React/Vite frontend). Items are grouped
by area and severity. Each item cites concrete files/lines where possible.

Legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low/Hygiene · 🟢 Feature

---

## ✅ Already fixed (this review)

These were small, safe fixes applied directly.

- **Home page dead feature cards** — 4 of 6 cards looked clickable but had no action.
  Wired navigation for Stock Data Explorer → `/stock-data`, AI Market Analysis & Personal
  AI Advisor → `/ai-analysis`, Market Insights → `/market-news`. (`frontend/src/pages/Home.jsx`)
- **Home cards not keyboard accessible** — added `role="button"`, `tabIndex`, Enter/Space
  handling, and a focus-visible outline. (`frontend/src/pages/Home.jsx`)
- **Home cleanup** — collapsed 6 duplicated card blocks into one `FeatureCard` component
  driven by a `FEATURES` array. (`frontend/src/pages/Home.jsx`)
- **Hardcoded footer year** — `© 2026` → `new Date().getFullYear()`. (`frontend/src/pages/Home.jsx`)
- **Auth API ignored errors** — `login`/`signup` now handle non-OK HTTP responses and
  network failures instead of returning `undefined`. (`frontend/src/api/auth.js`)
- **Stuck submit button** — a thrown request left Login/Signup frozen on "Logging in…".
  Wrapped in try/catch/finally. (`frontend/src/pages/Login.jsx`, `Signup.jsx`)
- **Junk files removed** — deleted `backend/app/Untitled-1` (empty) and
  `backend/app/models/StockAnalysisRequest` (unused, no `.py` extension, unimportable).
- **Lint cleanup** — removed unused `Search` import in `Portfolio.jsx`; dropped 4 unused
  `err` catch bindings in MarketNews/UserStockAnalysis/AIAnalysisScreen.

---

## Backend

### 🔴 Critical

1. **Live NVIDIA API key in `backend/.env:30`.** A real `nvapi-...` credential sits in the
   working tree. Treat as compromised and rotate. `.env` is gitignored (not tracked), but
   the secret is still exposed locally.
2. **Default JWT signing secret shipped in `.env`/`.env.example`.**
   `JWT_SECRET_KEY=dev-jwt-secret-change-this` (`app/config.py:6`). Anyone who knows the
   default can forge tokens for any user. No guard rejects the default in production.
3. **`wsgi.py` runs `services/ai_service.py` as a blocking subprocess on startup**
   (`wsgi.py:24-28`). Relative path, output captured/discarded, blocks boot. Dead/broken —
   remove it.

### 🟠 High

4. **Debug mode hardcoded on** — `app.run(debug=True)` (`wsgi.py:33`). Werkzeug debugger
   enables remote code execution. Must be env-driven and off in prod.
5. **CORS wide open** — `CORS()` with no origin restriction (`app/extensions.py:7`) allows
   all origins against an authenticated API. Whitelist the frontend origin.
6. **`Portfolio.user_id` has no ForeignKey** to `users.id` (`app/models/portfolio.py:8`).
   No referential integrity; deleting a user orphans portfolios.
7. **Raw `ALTER TABLE` migration hack at startup** with blanket `except Exception`
   (`app/__init__.py:30-47`). Swallows all errors, SQLite-only, only patches `stocks`.
   Replace with Alembic/Flask-Migrate.
8. **`/api/news/warnings` is unauthenticated** (`app/api/news/routes.py:14`) while every
   other route requires JWT. Inconsistent; lets anyone hammer MongoDB.

### 🟡 Medium

9. **Auth lacks input validation / rate limiting** (`app/api/auth/routes.py`).
   `request.get_json()` not null-checked (malformed body → 500 not 400); no email-format or
   password-strength checks; no brute-force protection on login.
10. **N+1 live-quote fetches behind a 4s global rate limiter** (`app/api/holdings/routes.py`,
    `app/api/ai/routes.py`, `services/market_data.py`). A portfolio of N holdings can block
    ~4N seconds. `/ai/analyze` always fetches live, so it's slow by default.
11. **`seed_database_stocks` fabricates fundamentals with `random`**
    (`services/market_data.py:400-450`). AI analysis and top-1000 recommendations run off
    random data until real data overwrites it — early recommendations are meaningless.
12. **Division-by-zero risk** in `holding.to_dict_with_live_data` (`app/models/holding.py:40`).
    `gain_loss_pct` divides by `amount_invested` with no guard; a legacy `0` row 500s.
13. **Fragile type coercion in top-1000 builder** (`app/api/ai/routes.py`). Assumes
    `change_percent` is always a `%` string; `json.loads(ai_pros/ai_cons)` not guarded.
14. **Process-unsafe batch state** (`app/api/ai/routes.py`). Module-global `analysis_progress`
    dict mutated from a background thread; breaks under multiple gunicorn workers. Also writes
    `batch_debug.log` into the repo root.
15. **Broad exception swallowing across services** — `get_company_overview`, the migration
    loop, and per-stock loops hide failures behind bare `print`/`return None`.

### ⚪ Low / Hygiene

16. **`batch_debug.log`** runtime artifact written into the repo tree.
17. **Hand-rolled `.env` parser** in `wsgi.py` instead of `python-dotenv` (not in
    `requirements.txt`). Running via `flask run`/gunicorn skips env loading entirely.
18. **`requirements.txt` missing imported deps** — `langgraph`, `typing_extensions` used in
    `services/ai_service.py` but not listed; multi-model path is effectively dead.
19. **Thin test coverage** — no tests for any HTTP route (auth, portfolio, holdings, AI); no
    JWT/ownership tests; no pytest config. Tests exist mainly for the news pipeline.

---

## Frontend

### 🟠 High

20. **Choppy / improper home intro animations.** The scroll intro is a `1070vh` pinned,
    scroll-driven sequence that reads layout geometry every frame via `useTransform`
    callbacks + `ResizeObserver` (`frontend/src/components/home/HomeScrollIntro.jsx`,
    `useIntroProgress.js`). On slower machines this janks. Also the hero SVG wave paths
    animate with `repeat: Infinity` (`Login.jsx`, `Signup.jsx`) and three long looping paths
    on `Home.jsx`, which run continuously and add GPU/CPU load. Needs: throttling, GPU-only
    transforms, pausing offscreen animations, and respecting `prefers-reduced-motion`
    consistently.
21. **JWT stored in `localStorage`** (`frontend/src/context/AuthContext.jsx:8`) — readable by
    any XSS. Consider httpOnly cookie or at least documented tradeoff.
22. **No token-expiry / global 401 handling.** When the 7-day token expires, API calls fail
    silently with no auto-logout or redirect to `/login`. No Axios/fetch interceptor layer.

### 🟡 Medium

23. **`/market-news` route is unprotected** (`frontend/src/App.jsx`) while the rest of the app
    is auth-gated. Decide if intentional; the page calls authed endpoints with a token it may
    not have.
23a. **Market News page appears broken — permanently empty.** Shows "No accepted negative/
    positive warnings yet" with no data (see screenshot report). Root cause: the page reads AI
    warnings from MongoDB (`backend/services/warning_store.py`), populated by the Kafka news
    pipeline (`services/news.py` → `warning_streamer.py`), which requires MongoDB + Kafka +
    `NEWS_API_KEY` running (`docker-compose.news.yml`). When the pipeline is off the collection
    is empty. Problems: (a) no "pipeline offline / no data yet" messaging — looks broken;
    (b) `MarketNews.jsx` only fetches when `token` exists but the route is public, so a
    logged-out user sees a blank page with no login prompt; (c) no distinction between "loaded,
    genuinely empty" and "backend/pipeline unavailable."
24. **`setState` called synchronously inside effects** — cascading renders flagged by lint in
    `MarketNews.jsx:67`, `Portfolio.jsx:123`, `UserStockAnalysis.jsx:120`.
25. **Functions accessed before declaration inside `useEffect`** — `loadTop1000`,
    `loadPortfolios` in `AIAnalysisScreen.jsx:100-101` (hoisting/stale-closure risk).
26. **Dead code in `Portfolio.jsx`** — local `getHoldings(portfolio)` (localStorage reader) is
    unused and collides conceptually with the imported `getHoldingsApi`. `holdingsLoading`
    state is set but never read.
27. **Inconsistent API error handling.** `holdings.js`/`auth.js` now normalize errors, but
    `ai.js`, `stockData.js`, `news.js`, `portfolio.js` still call `res.json()` directly with no
    `res.ok` check — failures surface as confusing data instead of a clean error.
28. **Missing loading/empty states** on several data pages — API failures can render blank
    sections with no feedback.

### ⚪ Low / Hygiene

29. **`__dirname` undefined in `vite.config.js:14`** under ESM — lint error; use
    `fileURLToPath(import.meta.url)`.
30. **Large JS bundle** — single chunk ~568 kB (gzip ~171 kB). Consider route-based code
    splitting / `manualChunks`.
31. **Error messages use an emoji prefix** (`❌`) rather than a styled alert component
    (`Login.jsx`, `Signup.jsx`) — minor polish.
32. **Fast-refresh lint warnings** — `AuthContext.jsx`/`CurrencyContext.jsx` export both a
    component and helpers from one file.

---

## 🟢 Feature backlog

- Token refresh / "remember me" + clean session-expiry UX.
- Edit holding (only add/delete/view exist today).
- Replace random-seeded fundamentals with real market data, or show a clear "simulated data"
  badge in the UI so recommendations aren't mistaken for real analysis.
- Global toast/error + loading + empty-state system across data pages.
- A reduced-motion-first, lighter home intro option for low-power devices.
