from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select

from app.config.settings import get_settings
from app.core.logging_config import logger
from app.db import session as db_session
from app.models.user_wallet import UserWallet, WalletTransaction


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


def _parse_user_id(yantra_user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(yantra_user_id).strip())
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"Invalid YantraIAS user id: {yantra_user_id!r}") from exc


def calculate_evaluation_amount(page_count: int, rate_per_page: float | None = None) -> int:
    settings = get_settings()
    rate = int(rate_per_page if rate_per_page is not None else settings.instamark_rate_per_page_inr)
    pages = max(int(page_count or 0), 0)
    return pages * rate


def _get_session_factory():
    return db_session._session_factory


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def insufficient_wallet_message(balance: float, required: float) -> str:
    return (
        f"Insufficient wallet balance. This evaluation costs ₹{int(required)} "
        f"but your wallet has ₹{int(balance)}. "
        "Please recharge your YantraIAS wallet and try again."
    )


async def assert_sufficient_balance(yantra_user_id: str, page_count: int) -> int:
    """Raise InsufficientWalletBalance if credits are too low for this evaluation."""
    required = calculate_evaluation_amount(page_count)
    summary = await get_wallet_summary(yantra_user_id)
    credits = int(summary.get("credits") or 0)
    if credits < required:
        raise InsufficientWalletBalance(float(credits), float(required))
    return required


async def get_wallet_summary(yantra_user_id: str) -> dict[str, Any]:
    settings = get_settings()
    rate = float(settings.instamark_rate_per_page_inr)
    factory = _get_session_factory()

    if not db_session.database_enabled() or factory is None:
        return {
            "yantra_user_id": yantra_user_id,
            "credits": None,
            "balance_inr": None,
            "rate_per_page_inr": rate,
            "wallet_enabled": False,
        }

    try:
        user_id = _parse_user_id(yantra_user_id)
    except ValueError:
        return {
            "yantra_user_id": yantra_user_id,
            "credits": None,
            "balance_inr": None,
            "rate_per_page_inr": rate,
            "wallet_enabled": False,
            "error": "invalid_user_id",
        }

    async with factory() as session:
        wallet = await session.get(UserWallet, user_id)
        credits = int(wallet.balance) if wallet is not None else 0
        updated_at = wallet.updated_at.isoformat() if wallet and wallet.updated_at else None

        return {
            "yantra_user_id": yantra_user_id,
            "credits": credits,
            "balance_inr": float(credits),
            "rate_per_page_inr": rate,
            "wallet_enabled": True,
            "updated_at": updated_at,
        }


async def _find_existing_debit(
    session,
    *,
    user_id: uuid.UUID,
    client_transaction_id: str,
) -> WalletTransaction | None:
    result = await session.execute(
        select(WalletTransaction).where(
            WalletTransaction.user_id == user_id,
            WalletTransaction.item_id == client_transaction_id,
            WalletTransaction.type == "debit",
            WalletTransaction.status == "completed",
        )
    )
    return result.scalar_one_or_none()


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
    amount = int(round(amount_inr))

    if amount != expected:
        raise ValueError(
            f"Invalid evaluation amount {amount}. Expected {expected} for {page_count} pages at ₹{rate}/page."
        )

    factory = _get_session_factory()
    if not db_session.database_enabled() or factory is None:
        return WalletDebitResult(
            balance_inr=0,
            amount_inr=float(amount),
            page_count=page_count,
            rate_per_page_inr=rate,
        )

    user_id = _parse_user_id(yantra_user_id)
    label = f"Instamark evaluation — {page_count} page{'s' if page_count != 1 else ''}"

    async with factory() as session:
        async with session.begin():
            if client_transaction_id:
                existing = await _find_existing_debit(
                    session,
                    user_id=user_id,
                    client_transaction_id=client_transaction_id,
                )
                if existing is not None:
                    wallet = await session.get(UserWallet, user_id)
                    balance = int(wallet.balance) if wallet is not None else existing.balance_after
                    return WalletDebitResult(
                        balance_inr=float(balance),
                        amount_inr=float(amount),
                        page_count=page_count,
                        rate_per_page_inr=rate,
                    )

            result = await session.execute(
                select(UserWallet).where(UserWallet.user_id == user_id).with_for_update()
            )
            wallet = result.scalar_one_or_none()
            if wallet is None:
                raise InsufficientWalletBalance(0, float(amount))

            balance_before = int(wallet.balance)
            if balance_before < amount:
                raise InsufficientWalletBalance(float(balance_before), float(amount))

            balance_after = balance_before - amount
            wallet.balance = balance_after
            wallet.updated_at = _utcnow()

            note = (
                f"Instamark evaluation: {page_count} pages @ ₹{int(rate)}/page — "
                f"₹{amount} debited (₹{balance_before} → ₹{balance_after})."
            )
            session.add(
                WalletTransaction(
                    user_id=user_id,
                    type="debit",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    label=label,
                    category="instamark",
                    item_id=client_transaction_id,
                    note=note,
                    status="completed",
                )
            )

    logger.info(
        "Wallet debited user=%s amount_inr=%s pages=%s tx=%s balance_inr=%s",
        yantra_user_id,
        amount,
        page_count,
        client_transaction_id or "-",
        balance_after,
    )

    return WalletDebitResult(
        balance_inr=float(balance_after),
        amount_inr=float(amount),
        page_count=page_count,
        rate_per_page_inr=rate,
    )


async def refund_evaluation_debit(
    *,
    yantra_user_id: str,
    amount_inr: float,
    client_transaction_id: Optional[str] = None,
    note: str = "Instamark evaluation failed — refund",
) -> Optional[float]:
    factory = _get_session_factory()
    if not db_session.database_enabled() or factory is None:
        return None

    amount = int(round(amount_inr))
    if amount <= 0:
        return None

    user_id = _parse_user_id(yantra_user_id)

    async with factory() as session:
        async with session.begin():
            if client_transaction_id:
                existing_refund = await session.execute(
                    select(WalletTransaction).where(
                        WalletTransaction.user_id == user_id,
                        WalletTransaction.item_id == client_transaction_id,
                        WalletTransaction.type == "credit",
                        WalletTransaction.category == "instamark",
                        WalletTransaction.status == "completed",
                    )
                )
                if existing_refund.scalar_one_or_none() is not None:
                    wallet = await session.get(UserWallet, user_id)
                    return float(wallet.balance) if wallet is not None else None

            result = await session.execute(
                select(UserWallet).where(UserWallet.user_id == user_id).with_for_update()
            )
            wallet = result.scalar_one_or_none()
            if wallet is None:
                return None

            balance_before = int(wallet.balance)
            balance_after = balance_before + amount
            wallet.balance = balance_after
            wallet.updated_at = _utcnow()

            refund_note = (
                f"{note} — ₹{amount} credited (₹{balance_before} → ₹{balance_after})."
            )
            session.add(
                WalletTransaction(
                    user_id=user_id,
                    type="credit",
                    amount=amount,
                    balance_before=balance_before,
                    balance_after=balance_after,
                    label="Instamark evaluation refund",
                    category="instamark",
                    item_id=client_transaction_id,
                    note=refund_note,
                    status="completed",
                )
            )

    logger.info(
        "Wallet refunded user=%s amount_inr=%s tx=%s balance_inr=%s",
        yantra_user_id,
        amount,
        client_transaction_id or "-",
        balance_after,
    )
    return float(balance_after)
