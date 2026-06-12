from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.db.base import Base
from app.models import instamark_evaluation  # noqa: F401

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


async def init_database() -> None:
    global _engine, _session_factory
    settings = get_settings()
    if not settings.database_url:
        logger.info("DATABASE_URL not set — Instamark evaluation persistence is disabled")
        return

    _engine = create_async_engine(
        _normalize_database_url(settings.database_url),
        echo=settings.database_echo,
        pool_pre_ping=True,
    )
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)

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
