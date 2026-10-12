# Market News, Warnings and Predictions Pipeline

## **The three stages**

**news-streamer → warning-streamer → prediction-streamer**

| Stage | Service | Reads | Does | Writes |
|---|---|---|---|---|
| 1 | **news-streamer** | NewsData API | Fetches and enriches market articles at startup, then every 24 hours | Kafka topic `atlas.market.news` |
| 2 | **warning-streamer** | Kafka topic `atlas.market.news` | AI analyzes articles into accepted per-ticker warnings | MongoDB `market_warnings` and Kafka topic `atlas.market.warnings` |
| 3 | **prediction-streamer** | Kafka topic `atlas.market.warnings`, recent accepted warnings, CSV fundamentals and a live quote when available | AI updates the ticker's outlook and target price; code calculates potential return | MongoDB `stock_predictions`, one document per symbol |

Redpanda supplies the Kafka topics; MongoDB stores warnings and predictions. Flask reads both collections. News predictions override model or simulated values on the AI Analysis page and its top-1000, refresh and analyze APIs. A failed model response never writes a simulated prediction to MongoDB.

## Setup

Start Docker Desktop, then copy the environment template from the project root:

```bash
cp backend/.env.example backend/.env
```

Add your NewsData and NVIDIA API keys to `backend/.env`. Keep real keys out of `backend/.env.example`.

```dotenv
NEWS_API_KEY=your-newsdata-key
NVIDIA_API_KEY=your-nvidia-key
NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
```

When you run the Flask backend on your computer with `wsgi.py`, point it at the published MongoDB port:

```dotenv
MONGO_URI=mongodb://localhost:27017
```

Don't use `mongodb://mongo:27017` here. The `mongo` hostname only resolves inside Docker, so the backend can't reach MongoDB and the warning cards stay empty. The containers are unaffected: `docker-compose.news.yml` sets their own `MONGO_URI`.

## Start

Start MongoDB, Redpanda, the daily news producer, the warning consumer, and the prediction consumer:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d
```

Follow all three streamers:

```bash
docker compose --profile docker-news -f docker-compose.news.yml logs -f news-streamer warning-streamer prediction-streamer
```

These messages confirm that the pipeline processed an article:

```text
[news-streamer] Delivered to atlas.market.news
[warning-streamer] Saved ... warning(s) from event ...
[warning-streamer] Published ... warning(s) to atlas.market.warnings
[prediction-streamer] Saved prediction for ...
```

## Development

Run one news collection cycle without waiting for the daily schedule:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d warning-streamer prediction-streamer
docker compose --profile docker-news -f docker-compose.news.yml run --build --rm -e NEWS_STREAM_MODE=once news-streamer
```

### Skipping already-published articles

The producer records published and unsupported articles in MongoDB at
`<MONGO_DATABASE>.<NEWS_SEEN_COLLECTION>`. The collection defaults to
`atlas.news_seen_articles`; set `NEWS_SEEN_COLLECTION` in `backend/.env` to override it.
Records use NewsData's `article_id` when available and the generated message ID otherwise.

One-shot runs skip those records and follow NewsData's `nextPage` until
`NEWS_API_SIZE` new articles are queued, there is no next page, or `MAX_NEWS_PAGES`
pages have been read (the default is 10). Published articles are recorded only after
Redpanda confirms delivery, so failed deliveries are retried on the next run.
Unsupported articles are recorded when skipped so they are not processed again.

If MongoDB is unreachable, the producer logs a warning and continues without memory,
which can republish the latest articles. Each run logs how many articles were new,
unsupported, and skipped as already seen. To reset only this memory, drop the
`<MONGO_DATABASE>.<NEWS_SEEN_COLLECTION>` collection in MongoDB.

Rebuild the containers after changing Python code, the model, or Docker configuration:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d --force-recreate news-streamer warning-streamer prediction-streamer
```

Docker reads `backend/.env` only when it creates a container. After changing `.env` (for example a new API key), recreate all three streamers so they pick up the change:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up -d --force-recreate news-streamer warning-streamer prediction-streamer
```

Restart `wsgi.py` as well when you change `.env`.

## Clear Old Data

The website reads warnings and predictions from MongoDB. The two Redpanda topics carry articles and accepted warnings between stages; clearing topics does not delete saved MongoDB results. These commands permanently delete data.

Delete warnings saved before a date, keeping newer ones:

```bash
docker exec atlas-mongo-1 mongosh --quiet atlas --eval 'db.market_warnings.deleteMany({created_at: {$lt: ISODate("2026-10-01")}})'
```

Delete every warning and prediction:

```bash
docker exec atlas-mongo-1 mongosh --quiet atlas --eval 'db.market_warnings.deleteMany({})'
docker exec atlas-mongo-1 mongosh --quiet atlas --eval 'db.stock_predictions.deleteMany({})'
```

Empty both topics, then restart the warning and prediction streamers so they read the new topics cleanly:

```bash
docker exec atlas-redpanda-1 rpk topic delete atlas.market.news
docker exec atlas-redpanda-1 rpk topic create atlas.market.news --partitions 1 --replicas 1
docker exec atlas-redpanda-1 rpk topic delete atlas.market.warnings
docker exec atlas-redpanda-1 rpk topic create atlas.market.warnings --partitions 1 --replicas 1
docker compose --profile docker-news -f docker-compose.news.yml restart warning-streamer prediction-streamer
```

## New prediction banner

The AI Analysis page and Portfolio AI analysis poll every 30 seconds while visible and logged in. New predictions show **“New prediction came in. Reload?”**, with tickers when there are three or fewer. Reload refetches analysis in place; Dismiss hides the banner until a newer prediction arrives. Failed polls are silent, and polling stops on logout or leaving the page.

The portfolio banner appears in the AI analysis modal or beside its AI Analysis button after the modal closes, and only reports tickers held in the selected portfolio. It reloads the existing portfolio recommendation feature; holdings are not sent to the prediction streamer. AI stock cards using stage-3 predictions display a **News** badge.

## Stop

Stop the news stack and keep the MongoDB data:

```bash
docker compose --profile docker-news -f docker-compose.news.yml down
```

Add `--volumes` to the `down` command to delete the MongoDB volume. The portfolio page refreshes its warning cards while it stays open.
