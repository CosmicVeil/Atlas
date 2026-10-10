# Atlas - AI Trading & Stock Analysis

Algorithmic trading and stock analysis platform powered by AI.

## Running the Project

### 1. Run the Backend
Navigate to the `backend` folder, set up your Python virtual environment and run the Flask server:
```powershell
# In the backend directory
.\.venv\Scripts\python.exe wsgi.py
```

### 2. Run the Frontend
Navigate to the `frontend` directory, install packages, and start the development server:
```bash
# In the frontend directory
npm install --legacy-peer-deps
npm run dev
```

### 3. Run the Market News and Warning Streamers

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

If you run the Flask backend on your computer instead of inside Docker, use the published MongoDB port:

```dotenv
MONGO_URI=mongodb://localhost:27017
```

Start MongoDB, Redpanda, the daily news producer, and the warning consumer:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d
```

The news producer runs as soon as the container starts, then waits 86,400 seconds before its next run. It sends enriched articles to the `atlas.market.news` Redpanda topic. The warning consumer sends each article to the NVIDIA model named in `NVIDIA_MODEL` and stores accepted positive or negative warnings in MongoDB.

Follow both streamers:

```bash
docker compose --profile docker-news -f docker-compose.news.yml logs -f news-streamer warning-streamer
```

Look for these messages to confirm the pipeline processed an article:

```text
[news-streamer] Delivered to atlas.market.news
[warning-streamer] Saved ... warning(s) from event ...
```

Run one news collection cycle during development:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d warning-streamer
docker compose --profile docker-news -f docker-compose.news.yml run --build --rm -e NEWS_STREAM_MODE=once news-streamer
```

Rebuild the containers after changing Python code, the model, or Docker configuration:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d --force-recreate
```

Stop the news stack and preserve MongoDB data:

```bash
docker compose --profile docker-news -f docker-compose.news.yml down
```

Add `--volumes` to the `down` command when you want to delete the MongoDB volume. The portfolio page refreshes its warning cards while it remains open.

## AI Development Workflow

`.ai-workflow/` runs a local Claude plan → Codex code → Claude review pipeline in an isolated Git worktree. Use `--bug` for bug fixes: Codex first reproduces the bug with a failing test and reviews the code to find the root cause, then Claude plans the fix. See [.ai-workflow/SETUP.md](.ai-workflow/SETUP.md).

```bash
python3 .ai-workflow/pipeline.py "Feature task with acceptance criteria"
python3 .ai-workflow/pipeline.py --bug "What happened, what you expected, and any error text"
```
