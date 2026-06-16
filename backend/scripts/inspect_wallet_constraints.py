import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text

from app.config.settings import get_settings
from app.db import session as db_session


async def main() -> None:
    get_settings.cache_clear()
    await db_session.init_database()

    async with db_session._engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT conname, pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'public.wallet_transactions'::regclass
                  AND contype = 'c'
                ORDER BY conname
                """
            )
        )
        for row in result:
            print(row)

        result = await conn.execute(
            text(
                """
                SELECT DISTINCT category, type
                FROM public.wallet_transactions
                ORDER BY category, type
                """
            )
        )
        print("distinct category/type:", [tuple(r) for r in result])

    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
