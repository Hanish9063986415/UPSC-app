# Deployment Guide (Vercel + Render)

Deploy **backend first**, then **frontend**, then **connect CORS**.

Replace every `YOUR_*` placeholder with your real values.

---

## Before you start

| Item | Where to get it |
|------|-----------------|
| GitHub repo | Code already pushed to GitHub |
| Gemini API key | [Google AI Studio](https://aistudio.google.com/apikey) |
| Render account | [render.com](https://render.com) |
| Vercel account | [vercel.com](https://vercel.com) |

**Never commit** `API_KEY`, `dev.env`, or `.env` files.

---

# STEP 1 — Deploy backend on Render

## 1.1 Create the service

1. Open **https://dashboard.render.com**
2. Click **New +** → **Blueprint**
3. Click **Connect account** → choose **GitHub** → authorize Render
4. Select your repository (e.g. `upsc-app`)
5. Render detects `render.yaml` at the repo root
6. Click **Apply**

## 1.2 Enter secret environment variables

When Render asks for values marked `sync: false`, enter:

| Key | Value (exact format) |
|-----|----------------------|
| `API_KEY` | Your Gemini API key (paste once, no quotes) |
| `FRONTEND_URL` | `https://placeholder.vercel.app` *(temporary — update in Step 3)* |
| `ALLOWED_ORIGINS` | `https://placeholder.vercel.app` *(temporary — update in Step 3)* |

All other variables are set automatically by `render.yaml`.

## 1.3 Choose plan and deploy

1. For **Instance Type**, select **Standard** ($25/month — **2 GB RAM**, recommended for PDF + AI workloads). Starter (512 MB) is not sufficient for full answer-sheet evaluations.
2. Click **Apply** / **Create**
3. Wait until status is **Live** (Build → Deploy can take 3–8 minutes)

## 1.4 Copy your backend URL

1. On the service page, copy the URL at the top, e.g.  
   `https://upsc-backend.onrender.com`
2. Write it down as **BACKEND_URL** (no trailing `/`)

## 1.5 Verify backend

Open in browser:

| URL | Expected result |
|-----|-----------------|
| `BACKEND_URL/health` | JSON with `"status": "healthy"` |
| `BACKEND_URL/docs` | Swagger API documentation page |

If health check fails, open **Logs** tab on Render and fix errors (usually missing `API_KEY`).

---

# STEP 2 — Deploy frontend on Vercel

## 2.1 Import project

1. Open **https://vercel.com/dashboard**
2. Click **Add New…** → **Project**
3. Click **Import** next to your GitHub repository
4. If repo is missing, click **Adjust GitHub App Permissions** and grant access

## 2.2 Configure build settings

On the **Configure Project** screen, set these **exact** values:

| Field | Value |
|-------|--------|
| Framework Preset | **Vite** |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Click **Edit** next to Root Directory and type: `frontend`

## 2.3 Add environment variable

Expand **Environment Variables**:

| Name | Value |
|------|--------|
| `VITE_API_BASE_URL` | Your **BACKEND_URL** from Step 1.4 |

Example:

```
VITE_API_BASE_URL=https://upsc-backend.onrender.com
```

Rules:

- Must start with `https://`
- **No** trailing slash at the end
- Apply to **Production** (and Preview if you use preview deployments)

## 2.4 Deploy

1. Click **Deploy**
2. Wait until status is **Ready** (1–3 minutes)
3. Copy the deployment URL, e.g. `https://upsc-app.vercel.app`
4. Write it down as **FRONTEND_URL** (no trailing `/`)

## 2.5 Verify frontend build

1. Open **FRONTEND_URL** in the browser — the UPSC UI should load
2. API calls will not work until Step 3 (CORS) is done

---

# STEP 3 — Connect frontend and backend (CORS)

## 3.1 Update Render environment

1. Go to **Render Dashboard** → service **upsc-backend**
2. Click **Environment** in the left sidebar
3. Update these two variables:

| Key | Value |
|-----|--------|
| `FRONTEND_URL` | Your **FRONTEND_URL** from Step 2.4 |
| `ALLOWED_ORIGINS` | Same as **FRONTEND_URL** |

Example:

```
FRONTEND_URL=https://upsc-app.vercel.app
ALLOWED_ORIGINS=https://upsc-app.vercel.app
```

4. Click **Save Changes**
5. Render redeploys automatically — wait until status is **Live** again

## 3.2 Custom domain on Vercel (optional)

If you add a custom domain later, also add it to Render:

```
ALLOWED_ORIGINS=https://upsc-app.vercel.app,https://www.yourdomain.com
```

---

# STEP 4 — Final test

1. Open **FRONTEND_URL** (Vercel — not Render)
2. Upload a test PDF
3. Start evaluation — progress/streaming should appear
4. If it fails, press **F12** → **Console** / **Network**:
   - Requests must go to `BACKEND_URL/api/evaluate-stream`
   - CORS errors → recheck Step 3 values match **FRONTEND_URL** exactly

---

# Reference — all environment variables

## Render (`upsc-backend`)

| Key | Required | Example |
|-----|----------|---------|
| `API_KEY` | Yes | `AIza...` |
| `ENVIRONMENT` | Auto | `production` |
| `GEMINI_MODEL` | Auto | `models/gemini-2.5-flash` |
| `FRONTEND_URL` | Yes | `https://upsc-app.vercel.app` |
| `ALLOWED_ORIGINS` | Yes | `https://upsc-app.vercel.app` |
| `PYTHON_VERSION` | Auto | `3.12.8` |
| `max_workers` | Auto | `8` |
| `pdf_render_workers` | Auto | `8` |
| `max_concurrent_evals` | Auto | `4` |
| `max_concurrent_model_answers` | Auto | `4` |
| `max_concurrent_requests` | Auto | `8` |
| `max_concurrent_pdf_jobs` | Auto | `1` |
| `extraction_batch_size` | Auto | `8` |
| `pdf_processing_batch_size` | Auto | `8` |
| `page_image_format` | Auto | `JPEG` |
| `target_eval_duration_seconds` | Auto | `180` |
| `pdf_zoom_factor` | Auto | `2` |
| `request_timeout` | Auto | `300` |

Do **not** add `DATABASE_URL` — database is not used.

## Vercel (`frontend` root)

| Key | Required | Example |
|-----|----------|---------|
| `VITE_API_BASE_URL` | Yes | `https://upsc-backend.onrender.com` |

---

# Reference — service settings

## Render (from `render.yaml`)

```
Root Directory:     backend
Runtime:            Docker
Dockerfile Path:    ./Dockerfile
Health Check Path:  /health
```

If using **Python** runtime (manual setup), set Start Command to:

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

## Vercel

```
Root Directory:     frontend
Framework:          Vite
Build Command:      npm run build
Output Directory:   dist
```

---

# Fix: `gunicorn: command not found` / `your_application.wsgi`

Render is using the **wrong start command** (Django default). Fix it now:

1. Render Dashboard → **upsc-backend** → **Settings**
2. Find **Start Command**
3. Replace whatever is there with **exactly**:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

4. Confirm **Root Directory** is `backend`
5. **Save Changes** → wait until **Live**

**Or** use Docker (recommended, from repo `render.yaml`):

1. **Settings** → change **Runtime** to **Docker** (if available) or recreate via **Blueprint**
2. **Dockerfile Path:** `backend/Dockerfile` (or `./Dockerfile` with Root Directory `backend`)
3. Leave Start Command **empty** (Dockerfile `CMD` runs uvicorn)

---

# Fix: Python 3.14 build failure (`pydantic-core` / maturin)

If logs show `Using Python version 3.14.3` and `pydantic-core` metadata failed:

1. Render Dashboard → **upsc-backend** → **Environment**
2. Add or update: `PYTHON_VERSION` = `3.12.8` (full version, not `3.12`)
3. **Manual Deploy** → Deploy latest commit (must include `backend/.python-version`)
4. Next build log should show `Using Python version 3.12.8`

---

# Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error in browser | `FRONTEND_URL` and `ALLOWED_ORIGINS` on Render must match Vercel URL exactly (`https`, no `/` at end) |
| Frontend calls `localhost` | Set `VITE_API_BASE_URL` on Vercel → **Redeploy** |
| Render build fails | Check **Logs**; confirm `backend/requirements.txt` exists |
| `pydantic-core` / maturin build error | Render used Python 3.14 — set `PYTHON_VERSION` to `3.12.8` (see below) |
| `gunicorn: command not found` | Set Start Command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (see fix section above) |
| `502` / timeout | Evaluation is long-running; check Render **Logs**; increase `request_timeout` or upgrade plan |
| **Memory limit exceeded** / service restart | Use **Standard (2 GB)** plan; confirm env vars from `render.yaml`; only one large PDF evaluation runs at a time (`max_concurrent_pdf_jobs=1`). If OOM persists, lower `pdf_processing_batch_size` to `6` |
| Evaluation slower than 3 minutes | Add comma-separated `API_KEYS` (multiple Gemini keys); confirm `pdf_render_workers=8` and `max_concurrent_evals=4` |
| `503` “processing other evaluations” | Another user’s PDF is running; wait and retry (expected under load) |
| Health check fails | Set `API_KEY` on Render |
| Blank page on Vercel | Confirm Root Directory is `frontend` and Output is `dist` |

---

# Redeploy after code changes

| Platform | Action |
|----------|--------|
| **Render** | Push to GitHub → auto-deploys (or **Manual Deploy** → Deploy latest commit) |
| **Vercel** | Push to GitHub → auto-deploys |
| **Env var changed on Vercel** | **Deployments** → **⋯** → **Redeploy** (required for `VITE_*` vars) |

---

# URLs summary

| What | URL |
|------|-----|
| App (users open this) | `FRONTEND_URL` — Vercel |
| API | `BACKEND_URL` — Render |
| API docs | `BACKEND_URL/docs` |
