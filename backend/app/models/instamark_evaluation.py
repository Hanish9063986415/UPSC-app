import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InstamarkEvaluation(Base):
    """Persisted Instamark evaluation for a YantraIAS user."""

    __tablename__ = "instamark_evaluations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    yantra_user_id: Mapped[str | None] = mapped_column(String(255), index=True)
    client_transaction_id: Mapped[str | None] = mapped_column(String(64), index=True)
    service: Mapped[str] = mapped_column(String(32), default="instamark", nullable=False)
    file_name: Mapped[str] = mapped_column(String(512), nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    amount_inr: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    rate_per_page: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    question_count: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Numeric(10, 2))
    marks_awarded: Mapped[float | None] = mapped_column(Numeric(10, 2))
    marks_possible: Mapped[float | None] = mapped_column(Numeric(10, 2))
    marks_percent: Mapped[int | None] = mapped_column(Integer)
    total_tokens: Mapped[int | None] = mapped_column(Integer)
    complete_package: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
