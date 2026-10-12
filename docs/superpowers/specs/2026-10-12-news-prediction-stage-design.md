# News-driven stock predictions (pipeline stage 3)

## Goal

Today the news pipeline has two stages: news articles turn into per-ticker warnings in MongoDB. The stock predictions on the AI Analysis page (recommendation, target price, potential return) are separate. They come from SQLite `stocks.ai_*` columns that nothing fills, so the page shows simulated values.

Add a third stage. A prediction model reads each new accepted warning, produces an updated stock prediction for that ticker, and stores it in MongoDB. The AI Analysis page and the Portfolio AI analysis use these predictions and tell the open page when a new one arrives.

## The three stages

| Stage | Service | Reads | Does | Writes |
|---|---|---|---|---|
| 1 | `news-streamer` (exists) | NewsData API | Fetches and enriches articles | Kafka `atlas.market.news` |
| 2 | `warning-streamer` (exists) | Kafka `atlas.market.news` | AI analyzes each article into per-ticker warnings | MongoDB `market_warnings` **and (new)** Kafka `atlas.market.warnings` |
| 3 | `prediction-streamer` (**new**) | Kafka `atlas.market.warnings` | AI turns the ticker's recent warnings + fundamentals into a stock prediction | MongoDB `stock_predictions` |

## Requirements

### Stage 2 change: publish accepted warnings

- After `warning-streamer` saves accepted warnings to MongoDB, it publishes each accepted warning to a new Kafka topic, `atlas.market.warnings` (env `KAFKA_WARNINGS_TOPIC`, default `atlas.market.warnings`), keyed by symbol. The message is JSON-serialisable (datetimes as ISO strings, no Mongo `_id`).
- A publish failure is logged and does not stop the warning from being saved or the Kafka offset from being committed. The existing save behaviour is unchanged.

### Stage 3: `prediction-streamer`

- New module `backend/services/prediction_streamer.py`, run with `python -m services.prediction_streamer`, following the structure of `warning_streamer.py` (consumer group `atlas-prediction-streamer`, `auto.offset.reset=earliest`, manual commit, SIGTERM/SIGINT stop flag, waits on `UNKNOWN_TOPIC_OR_PART`).
- For each warning message it builds a prediction for that symbol right away:
  - Stock fundamentals come from `data/stock_info.csv` (the container has no SQLite). Use the live price from `services.market_data.get_quote` when it returns one, otherwise the CSV price.
  - It loads that symbol's recent accepted warnings from MongoDB (most recent first, up to 10, from the last 14 days) and passes their headline, sentiment, impact score, reasoning and time horizon to the model.
  - The model call reuses `ai_service._call_multiple_models`. The prompt asks for the same JSON shape `ai_service.analyze_stock` returns (`recommendation`, `prediction`, `confidence`, `targetPrice`, `summary`, `pros`, `cons`, `riskFactors`), and must explain how the news changes the outlook.
  - `potentialReturn` is computed with `ai_service.calc_potential_return(targetPrice, price)`, never taken from the model.
  - If the model returns nothing or invalid JSON, no prediction is written for that message (no simulated predictions in MongoDB). Log it and commit the offset.
- Store the prediction in MongoDB collection `stock_predictions` (env `MONGO_PREDICTIONS_COLLECTION`), **one document per symbol, upserted**, with: `symbol`, `name`, `price`, `recommendation`, `prediction`, `confidence`, `targetPrice`, `potentialReturn`, `summary`, `pros`, `cons`, `riskFactors`, `source_warning_keys` (the warnings used), `model_provider` if known, `created_at` (first time), `updated_at` (this write). Index on `symbol` (unique) and `updated_at`.
- If several warnings for the same symbol arrive in a burst, each one may re-run the prediction; correctness over efficiency. Do not re-run when the incoming warning's `warning_key` is already in that symbol's `source_warning_keys` (redelivered message).

### Docker and config

- `docker-compose.news.yml`: create the `atlas.market.warnings` topic in `redpanda-init` alongside the existing one, add a `prediction-streamer` service (same pattern as `warning-streamer`, new `Dockerfile.prediction_streamer` like `Dockerfile.warning_streamer`), and give `warning-streamer` the `KAFKA_WARNINGS_TOPIC` env var.
- Add the new env vars to `backend/.env.example` with comments.

### Backend API (Flask, reads MongoDB)

- A small store module (e.g. `services/prediction_store.py`) for reading predictions, with the same short MongoDB timeouts as `warning_store.py`. If MongoDB is unreachable every endpoint below degrades to "no predictions" and never errors the page.
- **News predictions win.** In `/api/ai/top-1000`, `/api/ai/top-1000/refresh` and `/api/ai/analyze`, a ticker with a MongoDB prediction uses it (recommendation, confidence, reasoning/summary, key points, targetPrice, potentialReturn recomputed against the live price) instead of SQLite or the simulation. Mark such entries `"source": "news"` (others `"source": "model"` or `"simulated"`) and include `predictionUpdatedAt`.
- The top-1000 cache must not hide a newer news prediction: when MongoDB has a prediction with `updated_at` newer than the cache's `lastUpdated`, the response reflects it (merge or rebuild; either is fine).
- New endpoint `GET /api/ai/predictions/latest?since=<ISO timestamp>` (JWT required) returns `{ "latestUpdatedAt": <ISO or null>, "count": <n since `since`>, "symbols": [...] }` for predictions updated after `since`. Without `since`, it returns only `latestUpdatedAt`.

### Frontend: "new prediction" banner

- **AI Analysis page** (`frontend/src/pages/AIAnalysisScreen.jsx`): after the page loads its data it remembers the newest `predictionUpdatedAt`/`latestUpdatedAt`. It polls `/api/ai/predictions/latest?since=...` every 30 seconds while the page is open and visible. When `count > 0` it shows a non-blocking banner: **"New prediction came in. Reload?"** (show the tickers when 3 or fewer) with a **Reload** button and a dismiss button. Reload re-fetches the page's data in place (no full browser reload) and hides the banner. Dismiss hides it until the next new prediction.
- **Portfolio AI analysis** (`frontend/src/pages/Portfolio.jsx`, the "AI Portfolio Analysis" modal and page): same banner and polling, but only for predictions on tickers in the selected portfolio. Reload re-runs that portfolio's AI analysis fetch.
- Each prediction row/card that comes from the news stage shows a small "News" badge so users can tell it apart. Match the existing visual style of each page.
- Polling stops when the user logs out or leaves the page, and failed polls are silent.

### Documentation

- Update `docs/news-pipeline.md` so the three stages are the first thing a reader sees: a highlighted section (table or numbered list like the one above) naming **news-streamer → warning-streamer → prediction-streamer**, what each reads, does and writes, and the two topics and two MongoDB collections. Update Start, the log-following command, the confirmation log lines, Development, Clear Old Data (deleting predictions, emptying the new topic) and the rebuild instructions to include `prediction-streamer`. Describe the banner.

## Tests

- Backend (`backend/tests/`, `unittest`, no network, no real Kafka/MongoDB, mock them):
  - warning streamer publishes accepted warnings to the warnings topic and still commits when publishing fails;
  - prediction streamer: builds the prompt from CSV fundamentals and recent warnings, computes `potentialReturn` from `targetPrice`, upserts one document per symbol, skips redelivered warning keys, writes nothing when the model fails;
  - API: news prediction overrides SQLite/simulated values in top-1000 and analyze; `/api/ai/predictions/latest` with and without `since`; MongoDB down returns no predictions without an error.
- Frontend (`frontend/tests/*.test.mjs`, `node --test`): the banner logic (detecting new predictions since a timestamp, filtering to portfolio tickers, dismiss/reload state) is in a small pure module that is unit-tested.

## Out of scope

- Changing stages 1 and 2 beyond publishing warnings.
- Writing predictions into SQLite, or running the existing `analyze-all` batch.
- Websockets/SSE (polling is fine).
- Implementing or reverting `2026-07-27-remove-personalized-investment-suggestions-design.md`. Leave the existing portfolio recommendation feature as it is. The stage-3 predictions are market-wide (one per ticker, never built from a user's holdings); the portfolio banner only filters them to the tickers the user holds and must not send holdings to the model.
