"""
Main FastAPI application entry point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.api.routes_instamark import router as instamark_router
from app.api.routes_streaming import health_check, router as streaming_router
from app.config.settings import get_settings
from app.core.logging_config import logger, setup_logging
from app.db.session import close_database, init_database
from app.services.gemini_service_async import get_async_gemini_service
from app.middleware.rate_limit import RateLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting UPSC Answer Evaluation API")

    try:
        get_async_gemini_service()
        logger.info("Async Gemini AI service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini service: {e}")
        raise

    await init_database()

    yield

    await close_database()

    logger.info("Shutting down UPSC Answer Evaluation API")


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()

    setup_logging(log_level=settings.log_level, log_file=settings.log_file)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="""
        ## UPSC Answer Evaluation API

        AI-powered evaluation of UPSC answer sheets with real-time streaming.

        ### Endpoints:
        - `GET /health` or `GET /api/health` - Health check
        - `POST /api/evaluate` - Evaluate PDF (complete JSON)
        - `POST /api/evaluate-stream` - Evaluate PDF (streaming SSE)
        - `GET /api/live-visualization` - Real-time dashboard
        - `POST /api/export-evaluation` - Export evaluation data
        - `GET /api/instamark/evaluations` - List saved evaluations (YantraIAS user)
        - `GET /api/instamark/evaluations/{id}` - Full analysis JSON for one evaluation
        """,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
        debug=settings.debug,
    )

    allow_credentials = settings.cors_credentials and "*" not in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=allow_credentials,
        allow_methods=settings.cors_methods,
        allow_headers=settings.cors_headers,
    )

    app.add_middleware(
        RateLimitMiddleware,
        max_concurrent=settings.max_concurrent_requests,
    )
    logger.info(
        f"Rate limiting configured: max {settings.max_concurrent_requests} concurrent requests"
    )

    app.include_router(streaming_router, prefix="/api")
    app.include_router(instamark_router, prefix="/api")
    app.add_api_route("/health", health_check, methods=["GET"], tags=["Health"])

    @app.get("/", include_in_schema=False)
    async def redirect_to_home():
        """Redirect root to React frontend."""
        return RedirectResponse(url=settings.frontend_url)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
