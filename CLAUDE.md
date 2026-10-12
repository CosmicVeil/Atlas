# Atlas

Stock analysis web app. Flask + SQLite backend, React (Vite) frontend, and a Docker news pipeline (Redpanda/Kafka + MongoDB) that turns market news into warnings and stock predictions.

## Working with me

I'm using this project to learn system design and to understand how the code works. Optimize for my understanding, not just for finishing the task.

### Teach as you go

- **Before a non-trivial change**, explain the plan in plain words: what's wrong or missing, which parts of the system are involved, and why this approach.
- **Explain the system, not just the line.** Show where the change sits in the data flow (e.g. browser → Flask route → service → database), and what calls it and what it calls.
- **Name the design concept** when one is in play (caching, message queues, idempotency, consumer groups, retries, polling vs push, auth tokens, race conditions, etc.), define it in a sentence, and point to where this codebase uses it.
- **Give the trade-offs.** When there's more than one reasonable approach, say what each one costs and why you picked yours.
- **Reference real code** as `path/to/file.py:42` so I can open it, and quote only the few lines that matter.
- **Root causes, not symptoms.** When fixing a bug, explain why it happened and how you found it, so I can find the next one myself.
- Use plain language. Define jargon the first time. Prefer a short diagram or table over a long paragraph when it's clearer.
- If I ask "why" or "how does X work", answer that question directly before doing anything else.

### Report every change for my review

At the end of any task that changed files, include a **Changes** section:

1. A table of **every file changed, added or deleted**, with what changed and why, one row per file:

   | File | Change | Why |
   |---|---|---|
   | `backend/services/foo.py` | Added `bar()` | … |

2. **Suggested reading order**: which file to read first to understand the change, and which to read after.
3. **How to verify**: the exact commands you ran (tests, build) and their results, and anything you did *not* verify (e.g. not checked in a browser).
4. **Where it lives**: branch name, commit hash(es), and whether it's pushed. Give me the command to see the diff myself, e.g. `git show <hash>` or `git diff main...<branch>`.

Also list changes outside the repo (Docker containers rebuilt, database rows deleted, services restarted).

## Commands

Backend (from `backend/`; `.venv\Scripts\python.exe` on Windows):

```bash
.venv/bin/python wsgi.py                          # run Flask on :5000
.venv/bin/python -m unittest discover -s tests    # tests (offline, all external services mocked)
```

Frontend (from the project root):

```bash
npm --prefix frontend run dev              # Vite dev server
node --test frontend/tests/*.test.mjs      # tests
npm --prefix frontend run build            # production build
npm --prefix frontend run lint             # has pre-existing errors; don't add new ones
```

`python run.py` starts backend and frontend together. News pipeline commands (start, logs, one-off runs, clearing data, rebuilding) are in `docs/news-pipeline.md`.

## Architecture

- `backend/app/`: Flask app factory (`__init__.py`), config, SQLAlchemy models, and blueprints under `api/` (`auth`, `portfolio`, `holdings`, `stock_data`, `ai`, `news`). JWT auth via flask-jwt-extended.
- `backend/services/`: logic shared by Flask and the Docker streamers: `market_data.py` (Yahoo quotes, Alpha Vantage, CSV cache), `ai_service.py` (model calls and fallbacks), `news.py`, `warning_*`, `prediction_*`.
- `backend/data/`: `stock_info.csv` (stock fundamentals) and other data files. `backend/app/data/ai_top_1000.json` is a generated cache (gitignored).
- `frontend/src/`: `pages/` (one per route), `api/` (fetch wrappers per backend area), `context/` (`AuthContext`, `CurrencyContext`), `components/` (`ui/` is shadcn-style primitives).
- News pipeline (`docker-compose.news.yml`): `news-streamer` → Kafka `atlas.market.news` → `warning-streamer` → MongoDB `market_warnings` + Kafka `atlas.market.warnings` → `prediction-streamer` → MongoDB `stock_predictions`. Flask reads both collections.

## Gotchas

- `wsgi.py` loads `backend/.env` itself and overwrites existing env vars, including `PORT`.
- SQLite lives at `backend/instance/app.db` (Flask-SQLAlchemy instance folder), not `backend/app.db`.
- When Flask runs on the host, `MONGO_URI` must be `mongodb://localhost:27017`; `mongo:27017` only resolves inside Docker.
- Docker containers don't pick up code changes until rebuilt. Rebuild only the services you need: recreating `news-streamer` runs a news fetch and uses NewsData quota.
- Don't put concrete example values in model prompts' JSON templates; the model copies them (this caused a `$100` target price bug).
- Frontend `localStorage` token is checked for expiry in `AuthContext`; API 401s log the user out.
- `docs/superpowers/specs/2026-07-27-remove-personalized-investment-suggestions-design.md` is approved but not implemented. Don't add new features that send a user's holdings to an AI model without asking.

## Conventions

- Match the surrounding code's style, naming and comment density. Keep changes scoped to the task; mention unrelated issues instead of fixing them.
- Add or update tests for behavior you change. Tests must stay offline (mock Yahoo, NewsData, AI providers, Kafka and MongoDB).
- Work on a branch, not `main`. Don't push, merge, or delete data (MongoDB collections, Kafka topics, SQLite rows) without asking.
- Bigger features can go through the `.ai-workflow` pipeline (plan → code → review); specs live in `docs/superpowers/specs/`.
