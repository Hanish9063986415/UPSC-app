from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging_config import logger
from app.db.session import _session_factory, database_enabled
from app.models.instamark_evaluation import InstamarkEvaluation


def _extract_marks(complete_package: dict[str, Any]) -> tuple[float | None, float | None, int | None]:
    metadata = complete_package.get("metadata") or {}
    awarded = metadata.get("total_ai_magic_marks") or metadata.get("total_param_marks")
    possible = metadata.get("total_max_marks")
    marks_awarded = float(awarded) if awarded is not None else None
    marks_possible = float(possible) if possible is not None else None
    marks_percent = None
    if marks_possible and marks_possible > 0 and marks_awarded is not None:
        marks_percent = round((marks_awarded / marks_possible) * 100)
    return marks_awarded, marks_possible, marks_percent


def _serialize_evaluation(record: InstamarkEvaluation) -> dict[str, Any]:
    return {
        "id": str(record.id),
        "yantra_user_id": record.yantra_user_id,
        "client_transaction_id": record.client_transaction_id,
        "service": record.service,
        "file_name": record.file_name,
        "page_count": record.page_count,
        "amount_inr": float(record.amount_inr or 0),
        "rate_per_page": float(record.rate_per_page or 1),
        "status": record.status,
        "question_count": record.question_count,
        "duration_seconds": float(record.duration_seconds)
        if record.duration_seconds is not None
        else None,
        "marks_awarded": float(record.marks_awarded) if record.marks_awarded is not None else None,
        "marks_possible": float(record.marks_possible)
        if record.marks_possible is not None
        else None,
        "marks_percent": record.marks_percent,
        "total_tokens": record.total_tokens,
        "complete_package": record.complete_package,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "completed_at": record.completed_at.isoformat() if record.completed_at else None,
    }


async def save_instamark_evaluation(
    *,
    complete_package: dict[str, Any],
    file_name: str,
    total_questions: int,
    total_duration: float,
    total_tokens: int,
    yantra_user_id: Optional[str] = None,
    client_transaction_id: Optional[str] = None,
    page_count: Optional[int] = None,
    amount_inr: Optional[float] = None,
    rate_per_page: float = 1.0,
) -> Optional[str]:
    """Persist a completed evaluation. Returns evaluation UUID string or None if DB disabled."""
    if not database_enabled() or _session_factory is None:
        return None

    metadata = complete_package.get("metadata") or {}
    marks_awarded, marks_possible, marks_percent = _extract_marks(complete_package)
    now = datetime.now(timezone.utc)

    record = InstamarkEvaluation(
        yantra_user_id=yantra_user_id or None,
        client_transaction_id=client_transaction_id or None,
        file_name=file_name,
        page_count=int(page_count or 0),
        amount_inr=float(amount_inr or 0),
        rate_per_page=float(rate_per_page),
        status="completed",
        question_count=int(total_questions),
        duration_seconds=float(total_duration),
        marks_awarded=marks_awarded,
        marks_possible=marks_possible,
        marks_percent=marks_percent,
        total_tokens=int(total_tokens),
        complete_package=complete_package,
        completed_at=now,
    )

    async with _session_factory() as session:
        session.add(record)
        await session.commit()
        await session.refresh(record)
        logger.info(
            "Saved Instamark evaluation %s for user=%s file=%s",
            record.id,
            yantra_user_id or "anonymous",
            file_name,
        )
        return str(record.id)


async def list_instamark_evaluations(
    yantra_user_id: str,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    if not database_enabled() or _session_factory is None:
        return []

    async with _session_factory() as session:
        result = await session.execute(
            select(InstamarkEvaluation)
            .where(InstamarkEvaluation.yantra_user_id == yantra_user_id)
            .order_by(InstamarkEvaluation.created_at.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return [_serialize_evaluation(row) for row in rows]


async def get_instamark_evaluation(
    evaluation_id: str,
    *,
    yantra_user_id: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    if not database_enabled() or _session_factory is None:
        return None

    try:
        parsed_id = UUID(evaluation_id)
    except ValueError:
        return None

    async with _session_factory() as session:
        record = await session.get(InstamarkEvaluation, parsed_id)
        if record is None:
            return None
        if yantra_user_id and record.yantra_user_id != yantra_user_id:
            return None
        return _serialize_evaluation(record)
