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

# YantraIAS wallet_transactions.category must be one of:
# content, session, meet, wellness, subscription, other
ALLOWED_WALLET_TX_CATEGORIES = frozenset(
    {"content", "session", "meet", "wellness", "subscription", "other"}
)
WALLET_TX_CATEGORY = "other"

INSTAMARK_MAINTENANCE_MESSAGE = (
    "Instamark is temporarily under maintenance. Please try again in a few minutes."
)


def instamark_maintenance_message() -> str:
    return INSTAMARK_MAINTENANCE_MESSAGE


def normalize_wallet_category(category: str | None = None) -> str:
    """Map Instamark debits to a category accepted by YantraIAS wallet_transactions."""
    candidate = (category or WALLET_TX_CATEGORY).strip().lower()
    if candidate not in ALLOWED_WALLET_TX_CATEGORIES:
        logger.warning(
            "Unsupported wallet category %r — using %r for Instamark transaction",
            category,
            WALLET_TX_CATEGORY,
        )
        return WALLET_TX_CATEGORY
    return candidate


class InsufficientWalletBalance(Exception):
    def __init__(self, balance: float, required: float):
        self.balance = balance
        self.required = required
        super().__init__(f"Insufficient wallet balance: have {balance}, need {required}")


class WalletBillingUnavailable(Exception):
    """Wallet billing cannot run — evaluation must not start and no debit may occur."""

    def __init__(self, user_message: str | None = None, *, log_detail: str | None = None):
        self.user_message = user_message or instamark_maintenance_message()
        if log_detail:
            logger.error("Instamark billing unavailable: %s", log_detail)
        super().__init__(self.user_message)


def wallet_billing_configured() -> bool:
    url = get_settings().database_url
    return bool(url and str(url).strip())


def wallet_billing_active() -> bool:
    return wallet_billing_configured() and db_session.database_enabled()


def instamark_wallet_required() -> bool:
    """Production and any configured billing must use the wallet before evaluation."""
    settings = get_settings()
    return settings.environment == "production" or wallet_billing_configured()


def is_instamark_operational() -> bool:
    if not instamark_wallet_required():
        return True
    return wallet_billing_active()


def ensure_instamark_operational() -> None:
    if is_instamark_operational():
        return
    detail = (
        f"billing_required={instamark_wallet_required()} "
        f"billing_configured={wallet_billing_configured()} "
        f"database_connected={db_session.database_enabled()}"
    )
    raise WalletBillingUnavailable(log_detail=detail)


def ensure_wallet_billing_available() -> None:
    """Backward-compatible alias for routes that only checked DB connectivity."""
    ensure_instamark_operational()


def maintenance_error_payload() -> dict[str, str]:
    return {"message": instamark_maintenance_message(), "code": "maintenance"}


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
            "billing_configured": wallet_billing_configured(),
            "database_connected": False,
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
            "billing_configured": True,
            "database_connected": True,
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
        if instamark_wallet_required():
            raise WalletBillingUnavailable(
                log_detail="debit_for_evaluation called without an active database connection"
            )
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
                    category=normalize_wallet_category(WALLET_TX_CATEGORY),
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


async def get_evaluation_debit_status(
    *,
    yantra_user_id: str,
    client_transaction_id: str,
) -> dict[str, Any]:
    """Return whether a completed Instamark debit exists for this client transaction id."""
    ensure_wallet_billing_available()
    user_id = _parse_user_id(yantra_user_id)
    tx_id = (client_transaction_id or "").strip()
    if not tx_id:
        raise ValueError("client_transaction_id is required")

    factory = _get_session_factory()
    if factory is None:
        raise WalletBillingUnavailable()

    async with factory() as session:
        debit = await _find_existing_debit(
            session,
            user_id=user_id,
            client_transaction_id=tx_id,
        )
        wallet = await session.get(UserWallet, user_id)
        balance = int(wallet.balance) if wallet is not None else None

    if debit is None:
        return {
            "debited": False,
            "client_transaction_id": tx_id,
            "yantra_user_id": yantra_user_id,
            "balance_inr": float(balance) if balance is not None else None,
        }

    return {
        "debited": True,
        "client_transaction_id": tx_id,
        "yantra_user_id": yantra_user_id,
        "amount_inr": float(debit.amount),
        "balance_before_inr": float(debit.balance_before),
        "balance_after_inr": float(debit.balance_after),
        "balance_inr": float(balance) if balance is not None else float(debit.balance_after),
        "debited_at": debit.created_at.isoformat() if debit.created_at else None,
        "ledger_id": str(debit.id),
    }


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
                        WalletTransaction.category == WALLET_TX_CATEGORY,
                        WalletTransaction.label == "Instamark evaluation refund",
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
                    category=normalize_wallet_category(WALLET_TX_CATEGORY),
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
