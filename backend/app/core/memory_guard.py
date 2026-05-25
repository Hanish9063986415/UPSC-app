"""
Global guard so only a limited number of PDF evaluations run at once.
Prevents OOM when multiple users upload large answer sheets concurrently.
"""

import asyncio
from typing import Optional

from fastapi import HTTPException

from app.config.settings import get_settings
from app.core.logging_config import logger

_evaluation_semaphore: Optional[asyncio.Semaphore] = None
_active_pdf_jobs: int = 0


def _get_semaphore() -> asyncio.Semaphore:
    global _evaluation_semaphore
    if _evaluation_semaphore is None:
        settings = get_settings()
        limit = max(1, settings.max_concurrent_pdf_jobs)
        _evaluation_semaphore = asyncio.Semaphore(limit)
        logger.info(f"PDF evaluation memory guard: max {limit} concurrent job(s)")
    return _evaluation_semaphore


class EvaluationMemoryGuard:
    """Context manager that limits concurrent PDF evaluation workloads."""

    async def __aenter__(self):
        global _active_pdf_jobs
        settings = get_settings()
        sem = _get_semaphore()
        if _active_pdf_jobs >= settings.max_concurrent_pdf_jobs:
            logger.warning(
                f"PDF evaluation queue busy ({_active_pdf_jobs} active, "
                f"max {settings.max_concurrent_pdf_jobs})"
            )
        try:
            await asyncio.wait_for(sem.acquire(), timeout=float(settings.request_timeout))
        except asyncio.TimeoutError:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Server is processing other evaluations. "
                    "Please wait a minute and try again."
                ),
            ) from None
        _active_pdf_jobs += 1
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        global _active_pdf_jobs
        _active_pdf_jobs = max(0, _active_pdf_jobs - 1)
        _get_semaphore().release()
        return False


def get_evaluation_memory_guard() -> EvaluationMemoryGuard:
    return EvaluationMemoryGuard()
