"""
Verify Instamark wallet debits in Supabase (user_wallets + wallet_transactions).

Usage:
  python scripts/verify_wallet_debit.py USER_UUID
  python scripts/verify_wallet_debit.py USER_UUID --transaction CLIENT_TX_ID
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import select

from app.config.settings import get_settings
from app.db import session as db_session
from app.models.user_wallet import UserWallet, WalletTransaction
from app.services.wallet_service import (
    WalletBillingUnavailable,
    ensure_wallet_billing_available,
    get_evaluation_debit_status,
    get_wallet_summary,
)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Verify YantraIAS wallet debits for Instamark")
    parser.add_argument("user_id", help="YantraIAS user UUID")
    parser.add_argument(
        "--transaction",
        dest="client_transaction_id",
        help="Optional Instamark client_transaction_id to verify one debit",
    )
    parser.add_argument("--limit", type=int, default=10, help="Recent debit rows to list (default 10)")
    args = parser.parse_args()

    get_settings.cache_clear()
    await db_session.init_database()

    try:
        ensure_wallet_billing_available()
    except WalletBillingUnavailable as exc:
        print("ERROR:", exc)
        print("Fix DATABASE_URL on the server (Supabase session pooler URI, port 5432).")
        await db_session.close_database()
        sys.exit(1)

    summary = await get_wallet_summary(args.user_id)
    print("Wallet summary:", summary)

    if args.client_transaction_id:
        status = await get_evaluation_debit_status(
            yantra_user_id=args.user_id,
            client_transaction_id=args.client_transaction_id,
        )
        print("Debit status:", status)
        await db_session.close_database()
        return

    factory = db_session._session_factory
    if factory is None:
        print("ERROR: database session factory unavailable")
        sys.exit(1)

    from uuid import UUID

    user_uuid = UUID(args.user_id)

    async with factory() as session:
        wallet = await session.get(UserWallet, user_uuid)
        print("user_wallets row:", dict(wallet.__dict__) if wallet else None)

        result = await session.execute(
            select(WalletTransaction)
            .where(
                WalletTransaction.user_id == user_uuid,
                WalletTransaction.type == "debit",
            )
            .order_by(WalletTransaction.created_at.desc())
            .limit(args.limit)
        )
        rows = result.scalars().all()
        print(f"Recent debits ({len(rows)}):")
        for row in rows:
            print(
                " ",
                {
                    "id": str(row.id),
                    "amount": row.amount,
                    "balance_before": row.balance_before,
                    "balance_after": row.balance_after,
                    "item_id": row.item_id,
                    "label": row.label,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                },
            )

    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
