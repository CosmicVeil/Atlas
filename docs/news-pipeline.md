# Market News and Warning Pipeline

The news pipeline turns daily market news into the warning cards on the Market News and Portfolio pages. It runs in Docker:

- **news-streamer** fetches articles from NewsData, enriches them, and sends them to the `atlas.market.news` Redpanda topic. It runs as soon as the container starts, then every 86,400 seconds (24 hours).
- **warning-streamer** reads each article from the topic, sends it to the NVIDIA model named in `NVIDIA_MODEL`, and stores accepted positive or negative warnings in MongoDB.
- **redpanda** is the Kafka-compatible message broker, and **mongo** stores the warnings.

The Flask backend reads the warnings from MongoDB and serves them to the frontend.

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

Start MongoDB, Redpanda, the daily news producer, and the warning consumer:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d
```

Follow both streamers:

```bash
docker compose --profile docker-news -f docker-compose.news.yml logs -f news-streamer warning-streamer
```

These messages confirm that the pipeline processed an article:

```text
[news-streamer] Delivered to atlas.market.news
[warning-streamer] Saved ... warning(s) from event ...
```

## Development

Run one news collection cycle without waiting for the daily schedule:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d warning-streamer
docker compose --profile docker-news -f docker-compose.news.yml run --build --rm -e NEWS_STREAM_MODE=once news-streamer
```

### Skipping already-published articles

The producer records published and unsupported articles in MongoDB at
`<MONGO_DATABASE>.<NEWS_SEEN_COLLECTION>`. The collection defaults to
`atlas.news_seen_articles`; set `NEWS_SEEN_COLLECTION` in `backend/.env` to override it.
Records use NewsData's `article_id` when available and the generated message ID otherwise.

One-shot runs skip those records and follow NewsData's `nextPage` until
`NEWS_API_SIZE` new articles are queued, there is no next page, or `MAX_NEWS_PAGES`
pages have been read (the default is 5). Published articles are recorded only after
Redpanda confirms delivery, so failed deliveries are retried on the next run.
Unsupported articles are recorded when skipped so they are not processed again.

If MongoDB is unreachable, the producer logs a warning and continues without memory,
which can republish the latest articles. Each run logs how many articles were new,
unsupported, and skipped as already seen. To reset only this memory, drop the
`<MONGO_DATABASE>.<NEWS_SEEN_COLLECTION>` collection in MongoDB.

Rebuild the containers after changing Python code, the model, or Docker configuration:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d --force-recreate
```

## Stop

Stop the news stack and keep the MongoDB data:

```bash
docker compose --profile docker-news -f docker-compose.news.yml down
```

Add `--volumes` to the `down` command to delete the MongoDB volume. The portfolio page refreshes its warning cards while it stays open.
