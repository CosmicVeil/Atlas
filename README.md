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

### 3. Run the Market News + Warning Streamers
Create `backend/.env` from `backend/.env.example`, add `NEWS_API_KEY`, then start Redpanda and the producer:
```bash
docker compose -f docker-compose.news.yml up --build
```

The news streamer publishes enriched article messages to `atlas.market.news` once per day by default.
The warning streamer reads that topic, asks AI which stocks are affected, and stores accepted positive/negative warnings in MongoDB.
The portfolio page refreshes warning cards while it is open, so newly accepted warnings appear automatically.
