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
                SELECT pg_get_functiondef(p.oid)
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.proname = 'wallet_tx_category_ok'
                  AND n.nspname = 'public'
                """
            )
        )
        for row in result:
            print(row[0])

    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
