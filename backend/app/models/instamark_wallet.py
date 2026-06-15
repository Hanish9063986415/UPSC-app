import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InstamarkWallet(Base):
    """Per-user Instamark wallet balance (INR credits)."""

    __tablename__ = "instamark_wallets"

    yantra_user_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    balance_inr: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class InstamarkWalletLedger(Base):
    """Audit trail for wallet credits and debits."""

    __tablename__ = "instamark_wallet_ledger"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    yantra_user_id: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    amount_inr: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_transaction_id: Mapped[str | None] = mapped_column(String(64), index=True)
    note: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
