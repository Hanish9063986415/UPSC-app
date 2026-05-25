"""
Project entry point (run from repository root).

Start the full app (backend + frontend) with one command:

  npm start

Deploy:
  frontend/  -> Vercel  (set root directory to frontend)
  backend/   -> Render  (see render.yaml)
"""

if __name__ == "__main__":
    from run_dev import main

    raise SystemExit(main())
