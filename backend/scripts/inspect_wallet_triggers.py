"""List triggers/functions on Yantra wallet tables (run with backend/dev.env loaded)."""
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
    if db_session._engine is None:
        print("ERROR: database not connected")
        return

    async with db_session._engine.connect() as conn:
        for table in ("wallet_transactions", "user_wallets"):
            result = await conn.execute(
                text(
                    """
                    SELECT tgname, pg_get_triggerdef(t.oid)
                    FROM pg_trigger t
                    JOIN pg_class c ON c.oid = t.tgrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relname = :table
                      AND NOT t.tgisinternal
                    """
                ),
                {"table": table},
            )
            print(f"triggers on {table}:")
            for row in result:
                print(" ", row[0])
                print("   ", row[1])

        result = await conn.execute(
            text(
                """
                SELECT proname
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public'
                  AND proname ILIKE '%wallet%'
                ORDER BY proname
                """
            )
        )
        print("wallet functions:", [r[0] for r in result])

    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
