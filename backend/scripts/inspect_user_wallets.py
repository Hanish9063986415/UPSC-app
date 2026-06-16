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
        print("ERROR: database engine not initialized")
        return

    async with db_session._engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'user_wallets'
                ORDER BY ordinal_position
                """
            )
        )
        rows = result.fetchall()
        if not rows:
            print("user_wallets table not found")
            result = await conn.execute(
                text(
                    """
                    SELECT tablename FROM pg_tables
                    WHERE schemaname = 'public' AND tablename ILIKE '%wallet%'
                    ORDER BY tablename
                    """
                )
            )
            print("wallet tables:", [row[0] for row in result])
            return

        print("user_wallets columns:")
        for row in rows:
            print(" ", row)

        sample = await conn.execute(text("SELECT * FROM public.user_wallets LIMIT 3"))
        print("sample rows:", sample.keys())
        for row in sample:
            print(" ", dict(row._mapping))

        result = await conn.execute(
            text(
                """
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                  AND (tablename ILIKE '%wallet%' OR tablename ILIKE '%credit%')
                ORDER BY tablename
                """
            )
        )
        print("wallet/credit tables:", [row[0] for row in result])

        result = await conn.execute(
            text(
                """
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public' AND tablename LIKE 'instamark%'
                ORDER BY tablename
                """
            )
        )
        print("instamark tables:", [row[0] for row in result])

        for table in ("wallet_transactions", "user_wallet_snapshots"):
            result = await conn.execute(
                text(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = :table_name
                    ORDER BY ordinal_position
                    """
                ),
                {"table_name": table},
            )
            cols = result.fetchall()
            print(f"{table} columns:", cols)
            if cols:
                sample = await conn.execute(text(f"SELECT * FROM public.{table} LIMIT 2"))
                for row in sample:
                    print(f"  sample {table}:", dict(row._mapping))

    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
