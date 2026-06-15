from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.db import session as db_session
from app.models.instamark_wallet import InstamarkWallet, InstamarkWalletLedger


class InsufficientWalletBalance(Exception):
    def __init__(self, balance: float, required: float):
        self.balance = balance
        self.required = required
        super().__init__(f"Insufficient wallet balance: have {balance}, need {required}")


@dataclass
class WalletDebitResult:
    balance_inr: float
    amount_inr: float
    page_count: int
    rate_per_page_inr: float


def _quantize_inr(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calculate_evaluation_amount(page_count: int, rate_per_page: float | None = None) -> float:
    settings = get_settings()
    rate = float(rate_per_page if rate_per_page is not None else settings.instamark_rate_per_page_inr)
    pages = max(int(page_count or 0), 0)
    return float(_quantize_inr(Decimal(pages) * Decimal(str(rate))))


def _get_session_factory():
    return db_session._session_factory


async def get_wallet_summary(yantra_user_id: str) -> dict[str, Any]:
    settings = get_settings()
    rate = float(settings.instamark_rate_per_page_inr)
    factory = _get_session_factory()

    if not db_session.database_enabled() or factory is None:
        return {
            "yantra_user_id": yantra_user_id,
            "balance_inr": None,
            "rate_per_page_inr": rate,
            "wallet_enabled": False,
        }

    async with factory() as session:
        wallet = await session.get(InstamarkWallet, yantra_user_id)
        if wallet is None:
            wallet = InstamarkWallet(yantra_user_id=yantra_user_id, balance_inr=0)
            session.add(wallet)
            await session.commit()
            await session.refresh(wallet)

        return {
            "yantra_user_id": yantra_user_id,
            "balance_inr": float(wallet.balance_inr or 0),
            "rate_per_page_inr": rate,
            "wallet_enabled": True,
            "updated_at": wallet.updated_at.isoformat() if wallet.updated_at else None,
        }


async def debit_for_evaluation(
    *,
    yantra_user_id: str,
    page_count: int,
    amount_inr: float,
    client_transaction_id: Optional[str] = None,
) -> WalletDebitResult:
    settings = get_settings()
    rate = float(settings.instamark_rate_per_page_inr)
    expected = calculate_evaluation_amount(page_count, rate)
    amount = float(_quantize_inr(amount_inr))

    if amount != expected:
        raise ValueError(
            f"Invalid evaluation amount {amount}. Expected {expected} for {page_count} pages at ₹{rate}/page."
        )

    factory = _get_session_factory()
    if not db_session.database_enabled() or factory is None:
        return WalletDebitResult(
            balance_inr=0,
            amount_inr=amount,
            page_count=page_count,
            rate_per_page_inr=rate,
        )

    async with factory() as session:
        async with session.begin():
            result = await session.execute(
                select(InstamarkWallet)
                .where(InstamarkWallet.yantra_user_id == yantra_user_id)
                .with_for_update()
            )
            wallet = result.scalar_one_or_none()
            if wallet is None:
                wallet = InstamarkWallet(yantra_user_id=yantra_user_id, balance_inr=0)
                session.add(wallet)
                await session.flush()

            balance = _quantize_inr(wallet.balance_inr or 0)
            debit = _quantize_inr(amount)

            if balance < debit:
                raise InsufficientWalletBalance(float(balance), float(debit))

            wallet.balance_inr = float(balance - debit)
            session.add(
                InstamarkWalletLedger(
                    yantra_user_id=yantra_user_id,
                    amount_inr=float(-debit),
                    entry_type="debit",
                    page_count=page_count,
                    client_transaction_id=client_transaction_id,
                    note=f"Instamark evaluation ({page_count} pages @ ₹{rate}/page)",
                )
            )

    logger.info(
        "Wallet debited user=%s amount_inr=%s pages=%s tx=%s balance_inr=%s",
        yantra_user_id,
        amount,
        page_count,
        client_transaction_id or "-",
        wallet.balance_inr,
    )

    return WalletDebitResult(
        balance_inr=float(wallet.balance_inr),
        amount_inr=amount,
        page_count=page_count,
        rate_per_page_inr=rate,
    )


async def refund_evaluation_debit(
    *,
    yantra_user_id: str,
    amount_inr: float,
    client_transaction_id: Optional[str] = None,
    note: str = "Evaluation failed — refund",
) -> Optional[float]:
    factory = _get_session_factory()
    if not db_session.database_enabled() or factory is None:
        return None

    amount = float(_quantize_inr(amount_inr))
    if amount <= 0:
        return None

    async with factory() as session:
        async with session.begin():
            result = await session.execute(
                select(InstamarkWallet)
                .where(InstamarkWallet.yantra_user_id == yantra_user_id)
                .with_for_update()
            )
            wallet = result.scalar_one_or_none()
            if wallet is None:
                wallet = InstamarkWallet(yantra_user_id=yantra_user_id, balance_inr=0)
                session.add(wallet)
                await session.flush()

            wallet.balance_inr = float(_quantize_inr(wallet.balance_inr or 0) + _quantize_inr(amount))
            session.add(
                InstamarkWalletLedger(
                    yantra_user_id=yantra_user_id,
                    amount_inr=amount,
                    entry_type="refund",
                    client_transaction_id=client_transaction_id,
                    note=note,
                )
            )

    logger.info(
        "Wallet refunded user=%s amount_inr=%s tx=%s balance_inr=%s",
        yantra_user_id,
        amount,
        client_transaction_id or "-",
        wallet.balance_inr,
    )
    return float(wallet.balance_inr)
