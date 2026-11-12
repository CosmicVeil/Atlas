# Creates GitHub issues for the Atlas review backlog.
# Prereq: `gh auth login` completed for github.com with repo access.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/create_issues.ps1

$ErrorActionPreference = "Stop"
$gh = "$env:ProgramFiles\GitHub CLI\gh.exe"
$repo = "CosmicVeil/Atlas"

# Ensure labels exist (ignore errors if they already do)
$labels = @(
  @{ name = "critical"; color = "b60205" },
  @{ name = "high";     color = "d93f0b" },
  @{ name = "medium";   color = "fbca04" },
  @{ name = "low";      color = "0e8a16" },
  @{ name = "security"; color = "5319e7" },
  @{ name = "frontend"; color = "1d76db" },
  @{ name = "backend";  color = "0052cc" },
  @{ name = "bug";      color = "ee0701" },
  @{ name = "enhancement"; color = "a2eeef" }
)
foreach ($l in $labels) {
  & $gh label create $l.name --color $l.color --repo $repo 2>$null
}

function New-Issue($title, $body, $labelCsv) {
  Write-Host "Creating: $title"
  & $gh issue create --repo $repo --title $title --body $body --label $labelCsv
}

# ---- Issues ----

New-Issue "Rotate committed NVIDIA API key (secret exposure)" @"
A real NVIDIA API key (``nvapi-...``) is present in ``backend/.env`` in the working tree.
``.env`` is gitignored (not tracked), but the live secret should be treated as compromised.

**Action:** rotate the key immediately; keep real keys out of the working tree; verify
``.env`` never entered git history.

Area: backend. Severity: critical.
"@ "critical,security,backend"

New-Issue "Default JWT signing secret shipped in .env / .env.example" @"
``JWT_SECRET_KEY`` defaults to ``dev-jwt-secret-change-this`` (``backend/app/config.py:6``)
and that value is shipped in ``.env``/``.env.example``. Anyone who knows the default can
forge valid JWTs for any user. There is no guard that rejects the default in production.

**Fix:** require a strong secret from the environment; fail startup if it equals the known
default when not in debug/dev.
"@ "critical,security,backend"

New-Issue "wsgi.py runs ai_service.py as a blocking subprocess on startup" @"
``backend/wsgi.py:24-28`` runs ``services/ai_service.py`` via ``subprocess.run(...)`` before
``create_app()``. It blocks boot, uses a relative path (only works when CWD is ``backend/``),
and captures/discards output. This is dead/broken code.

**Fix:** remove the subprocess call.
"@ "critical,backend,bug"

New-Issue "Flask debug mode hardcoded on" @"
``backend/wsgi.py:33`` calls ``app.run(debug=True, ...)``. The Werkzeug debugger allows
remote code execution and leaks stack traces. Must be environment-driven and off in prod.
"@ "high,security,backend"

New-Issue "CORS is wide open" @"
``backend/app/extensions.py:7`` initializes ``CORS()`` with no origin restriction, allowing
all origins against an authenticated API.

**Fix:** whitelist the frontend origin via ``resources``/``origins``.
"@ "high,security,backend"

New-Issue "Portfolio.user_id has no ForeignKey to users.id" @"
``backend/app/models/portfolio.py:8`` defines ``user_id`` as a plain integer with no FK.
No referential integrity; deleting a user orphans portfolios.

**Fix:** add ``db.ForeignKey('users.id')`` and a relationship/cascade.
"@ "high,backend"

New-Issue "Startup ALTER TABLE migration hack swallows all errors" @"
``backend/app/__init__.py:30-47`` loops raw ``ALTER TABLE stocks ADD COLUMN ...`` inside a
bare ``except Exception: rollback()``. It hides real failures, is SQLite-only, and patches
only the ``stocks`` table.

**Fix:** adopt Alembic / Flask-Migrate.
"@ "high,backend"

New-Issue "/api/news/warnings is unauthenticated" @"
``backend/app/api/news/routes.py:14`` (``get_warning_feed``) has no ``@jwt_required()`` while
every other route requires JWT. Inconsistent and lets unauthenticated clients hit MongoDB.
"@ "high,security,backend"

New-Issue "Signup: no email normalization -> near-duplicate accounts" @"
Emails are stored as-is (``backend/app/api/auth/routes.py``, ``app/models/user.py``). The DB
enforces ``unique=True`` on exact match, but ``Test@x.com`` and ``test@x.com`` (or trailing
whitespace) create two accounts because emails are not normalized/lowercased/trimmed.

**Fix:** normalize (trim + lowercase) before lookup and insert.
Reported by user.
"@ "medium,backend,bug"

New-Issue "No email format validation (backend or frontend)" @"
Signup accepts any string as an email — e.g. ``abc`` — with no format validation on the
backend (``app/api/auth/routes.py``) and only HTML ``type=email`` on the frontend.

**Fix:** validate email format server-side; surface a clear error client-side.
Reported by user.
"@ "medium,backend,frontend,bug"

New-Issue "Auth endpoints lack input validation and rate limiting" @"
``backend/app/api/auth/routes.py``: ``request.get_json()`` isn't null-checked (malformed body
-> 500 instead of 400); no password strength/length checks; no brute-force protection on
login.
"@ "medium,security,backend"

New-Issue "N+1 live-quote fetches serialized behind a 4s global rate limiter" @"
``get_holdings?live=true`` and the AI endpoints call ``market_data.get_quote(symbol)`` per
holding (``app/api/holdings/routes.py``, ``app/api/ai/routes.py``). ``get_quote`` enforces a
~4s global interval, so N holdings can block ~4N seconds. ``/ai/analyze`` always fetches live.

**Fix:** batch/concurrent fetching with caching; avoid live fetch on hot paths.
"@ "medium,backend"

New-Issue "seed_database_stocks fabricates fundamentals with random values" @"
``backend/services/market_data.py:400-450`` seeds ~1000 stocks with ``random`` prices/P-E/EPS
etc. AI analysis and top-1000 recommendations run off this random data until real data
overwrites it, so early recommendations are meaningless.

**Fix:** seed from real data or clearly flag simulated data.
"@ "medium,backend"

New-Issue "Division-by-zero risk in holding.to_dict_with_live_data" @"
``backend/app/models/holding.py:40`` computes ``gain_loss_pct`` by dividing by
``amount_invested`` with no guard; a legacy ``0`` row 500s.
"@ "medium,backend,bug"

New-Issue "Process-unsafe batch-analysis global state" @"
``backend/app/api/ai/routes.py`` keeps batch progress in a module-global dict mutated from a
background thread; breaks under multiple gunicorn workers. Also writes ``batch_debug.log``
into the repo root.
"@ "medium,backend"

New-Issue "Thin backend test coverage (no route/auth tests)" @"
No tests for any HTTP route (auth, portfolio, holdings, AI), no JWT/ownership tests, no pytest
config. Tests exist mainly for the news pipeline.
"@ "low,backend"

New-Issue "Home intro animations are choppy / not GPU-friendly" @"
The home scroll intro is a ``1070vh`` pinned, scroll-driven sequence that reads layout
geometry every frame (``frontend/src/components/home/HomeScrollIntro.jsx``,
``useIntroProgress.js``). Hero SVG wave paths loop forever (``repeat: Infinity`` in
``Login.jsx``/``Signup.jsx`` and three long paths in ``Home.jsx``). On slower machines this
janks.

**Fix:** throttle/rAF-batch, GPU-only transforms, pause offscreen animations, honor
``prefers-reduced-motion`` consistently.
Reported by user ("front page is choppy, animations aren't proper").
"@ "high,frontend,bug"

New-Issue "Market News page appears broken (permanently empty)" @"
The Market News page shows "No accepted negative/positive warnings yet" with no data.

**Root cause:** it reads AI warnings from MongoDB (``backend/services/warning_store.py``),
populated by the Kafka news pipeline (``services/news.py`` -> ``warning_streamer.py``), which
needs MongoDB + Kafka + ``NEWS_API_KEY`` running (``docker-compose.news.yml``). With the
pipeline off, the collection is empty.

**Problems:**
- No "pipeline offline / no data yet" messaging — looks broken.
- ``MarketNews.jsx`` only fetches when ``token`` exists, but ``/market-news`` is a public
  route, so a logged-out user sees a blank page with no login prompt.
- No distinction between "loaded but genuinely empty" and "backend/pipeline unavailable."

Reported by user ("this page isn't working").
"@ "high,frontend,bug"

New-Issue "JWT stored in localStorage (XSS-readable)" @"
``frontend/src/context/AuthContext.jsx:8`` stores the JWT in ``localStorage``, readable by any
XSS. Consider an httpOnly cookie, or document the tradeoff and harden against XSS.
"@ "high,security,frontend"

New-Issue "No token-expiry / global 401 handling on frontend" @"
When the 7-day token expires, API calls fail silently with no auto-logout or redirect to
``/login``. There is no shared fetch interceptor layer.

**Fix:** centralize fetch, detect 401, logout + redirect.
"@ "high,frontend,bug"

New-Issue "/market-news route is unprotected" @"
``frontend/src/App.jsx`` leaves ``/market-news`` public while the rest of the app is
auth-gated; the page calls authed endpoints with a token it may not have. Decide and make
consistent.
"@ "medium,frontend"

New-Issue "setState called synchronously inside effects (cascading renders)" @"
Lint flags synchronous ``setState`` in effects: ``MarketNews.jsx:67``, ``Portfolio.jsx:123``,
``UserStockAnalysis.jsx:120``.
"@ "medium,frontend,bug"

New-Issue "Functions used before declaration inside useEffect" @"
``AIAnalysisScreen.jsx:100-101`` calls ``loadTop1000`` / ``loadPortfolios`` before they are
declared (hoisting / stale-closure risk).
"@ "medium,frontend,bug"

New-Issue "Dead code in Portfolio.jsx" @"
Local ``getHoldings(portfolio)`` (localStorage reader) is unused and conceptually collides
with the imported ``getHoldingsApi``; ``holdingsLoading`` is set but never read.
"@ "low,frontend"

New-Issue "Inconsistent API error handling across frontend api/*" @"
``holdings.js`` and ``auth.js`` normalize errors, but ``ai.js``, ``stockData.js``, ``news.js``,
``portfolio.js`` still call ``res.json()`` directly with no ``res.ok`` check, so failures
surface as confusing data rather than a clean error.
"@ "medium,frontend,bug"

New-Issue "Missing loading/empty states on data pages" @"
Several data pages can render blank sections on API failure with no user feedback.
"@ "medium,frontend"

New-Issue "__dirname undefined in vite.config.js under ESM" @"
``frontend/vite.config.js:14`` uses ``__dirname`` which is undefined in ESM (lint error).
Use ``fileURLToPath(import.meta.url)``.
"@ "low,frontend,bug"

New-Issue "Large JS bundle (~568 kB)" @"
Production build emits a single ~568 kB (gzip ~171 kB) chunk. Consider route-based code
splitting / ``manualChunks``.
"@ "low,frontend"

New-Issue "Feature: token refresh + session-expiry UX" @"
Add refresh token / "remember me" and a clean expiry experience instead of silent failures.
"@ "enhancement,frontend"

New-Issue "Feature: edit holding" @"
Only add/delete/view exist today; add an edit-holding flow.
"@ "enhancement,frontend,backend"

New-Issue "Feature: real market data or a clear 'simulated data' badge" @"
Replace random-seeded fundamentals with real data, or clearly badge simulated data so AI
recommendations aren't mistaken for real analysis.
"@ "enhancement,backend,frontend"

Write-Host "`nAll issues created." -ForegroundColor Green
