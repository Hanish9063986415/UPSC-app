# UPSC Answer Evaluation

FastAPI backend + React (Vite) frontend. No database required — evaluations stream live to the UI.

## Project structure

```
upsc-app/
├── frontend/          # React + Vite (deploy to Vercel)
├── backend/           # FastAPI API (deploy to Render)
├── main.py            # Local dev entry (starts both servers)
├── run_dev.py         # Dev runner used by main.py
├── render.yaml        # Render blueprint
├── package.json       # npm start
└── README.md
```

## Start the app (one command)

From the project root:

```bash
npm start
```

Same command on Windows, macOS, and Linux. It starts **both** the API and the UI.

| Service | URL |
|---------|-----|
| App UI | http://localhost:5173 |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

Press **Ctrl+C** to stop both servers.

### Alternatives (same behavior)

```bash
python main.py
```

Windows:

```bat
start.bat
```

macOS / Linux:

```bash
./start.sh
```

## First-time setup

1. Install [Node.js](https://nodejs.org/) (for the frontend).
2. Copy `backend/.env.example` to `backend/dev.env` and set your Gemini API key.
3. Run `npm start` from the repo root. The runner creates `venv/`, installs Python and npm dependencies, and creates `frontend/.env` when needed.

## Backend only (optional)

```bash
python main.py --api-only
```

## Deployment

**Full step-by-step guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)

- **Frontend** → Vercel (`frontend/` as root directory)
- **Backend** → Render (see `render.yaml`)
- **Database** → Not required

## Connect a new GitHub repo

```bash
git init
git add .
git commit -m "Initial commit: UPSC evaluation app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Never commit `backend/dev.env`, `backend/.env`, or API keys.
