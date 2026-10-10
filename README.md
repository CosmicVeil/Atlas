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

The Market News and portfolio warning cards come from a Docker pipeline: a daily NewsData producer, an NVIDIA warning consumer, Redpanda, and MongoDB. With Docker Desktop running and your API keys in `backend/.env`:

```bash
docker compose --profile docker-news -f docker-compose.news.yml up --build -d
```

See [docs/news-pipeline.md](docs/news-pipeline.md) for setup, logs, one-off runs, rebuilding, and stopping.

## AI Development Workflow

`.ai-workflow/` runs a local Claude plan → Codex code → Claude review pipeline in an isolated Git worktree. Use `--bug` for bug fixes: Codex first reproduces the bug with a failing test and reviews the code to find the root cause, then Claude plans the fix. See [.ai-workflow/SETUP.md](.ai-workflow/SETUP.md).

```bash
python3 .ai-workflow/pipeline.py "Feature task with acceptance criteria"
python3 .ai-workflow/pipeline.py --bug "What happened, what you expected, and any error text"
```
