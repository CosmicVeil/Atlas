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

### 3. Run the Market News Pipeline

The Market News warning cards and the news-driven stock predictions come from a three-stage Docker pipeline: **news-streamer** fetches articles, **warning-streamer** turns them into warnings, and **prediction-streamer** turns warnings into stock predictions. Redpanda carries messages between stages and MongoDB stores the results. With Docker Desktop running and your API keys in `backend/.env`:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d
```

See [docs/news-pipeline.md](docs/news-pipeline.md) for setup, logs, one-off runs, clearing old data, rebuilding, and stopping.

## Testing

Frontend, from the project root:
```bash
node --test frontend/tests/*.test.mjs
npm --prefix frontend run build
npm --prefix frontend run lint
```

Lint has pre-existing errors, so treat it as informational and avoid adding new ones in files you change.

Backend, from `backend/`, with the virtual environment's Python (`.venv\Scripts\python.exe` on Windows):
```bash
.venv/bin/python -m unittest discover -s tests
```

The tests run offline: they mock NewsData, NVIDIA, Redpanda and MongoDB.

## AI Development Workflow

`.ai-workflow/` runs a local Claude plan → Codex code → Claude review pipeline in an isolated Git worktree. Use `--bug` for bug fixes: Codex first reproduces the bug with a failing test and reviews the code to find the root cause, then Claude plans the fix. See [.ai-workflow/SETUP.md](.ai-workflow/SETUP.md).

```bash
python3 .ai-workflow/pipeline.py "Feature task with acceptance criteria"
python3 .ai-workflow/pipeline.py --bug "What happened, what you expected, and any error text"
```
