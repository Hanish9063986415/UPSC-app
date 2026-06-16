import ssl
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.db.base import Base
from app.models import instamark_evaluation, user_wallet  # noqa: F401

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def _connect_args_for_url(url: str) -> dict:
    """Supabase Postgres requires SSL via asyncpg connect_args."""
    host = url.lower()
    if "supabase.co" in host or "supabase.com" in host or "pooler.supabase" in host:
        # Encrypted connection; relaxed verify for Supabase pooler on Windows/Python.
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {
            "ssl": ctx,
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
        }
    return {}


def _uses_supabase_pooler(url: str) -> bool:
    lowered = url.lower()
    return "pooler.supabase.com" in lowered


async def init_database() -> None:
    global _engine, _session_factory
    settings = get_settings()
    if not settings.database_url:
        logger.info("DATABASE_URL not set — Instamark evaluation persistence is disabled")
        return

    db_url = _normalize_database_url(settings.database_url)
    connect_args = _connect_args_for_url(db_url)

    engine_kwargs: dict = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
        "connect_args": connect_args,
    }
    if _uses_supabase_pooler(db_url):
        # Session pooler + NullPool avoids PgBouncer prepared-statement conflicts.
        engine_kwargs["poolclass"] = NullPool

    _engine = create_async_engine(db_url, **engine_kwargs)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

    try:
        from sqlalchemy import text

        async with _engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection verified")
    except Exception as exc:
        logger.error("Database connection failed — persistence disabled: %s", exc)
        await _engine.dispose()
        _engine = None
        _session_factory = None
        return

    if settings.database_auto_init:
        async with _engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ensured (database_auto_init=true)")

    logger.info("YantraIAS database connection ready for Instamark evaluations")


async def close_database() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def database_enabled() -> bool:
    return _session_factory is not None


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    if _session_factory is None:
        raise RuntimeError("Database is not configured")
    async with _session_factory() as session:
        yield session
