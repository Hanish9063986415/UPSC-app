import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text

from app.config.settings import get_settings
from app.db import session as db_session
from app.services.evaluation_storage_service import save_instamark_evaluation


async def main() -> None:
    get_settings.cache_clear()
    await db_session.init_database()

    if db_session._engine is None:
        print("ERROR: database engine not initialized — check DATABASE_URL and backend logs")
        return

    try:
        async with db_session._engine.connect() as conn:
            result = await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables "
                    "WHERE schemaname = 'public' AND tablename LIKE 'instamark%'"
                )
            )
            print("Tables:", [row[0] for row in result] or "(none)")
    except Exception as exc:
        print("CONNECT FAILED:", type(exc).__name__, exc)
        return

    eval_id = await save_instamark_evaluation(
        complete_package={"metadata": {"total_max_marks": 10}, "questions": {}},
        file_name="diagnostic-test.pdf",
        total_questions=1,
        total_duration=1.0,
        total_tokens=100,
        yantra_user_id="3ad99c0e-557e-4ad5-b651-6428a9745838",
        client_transaction_id="diag-tx-001",
        page_count=5,
        amount_inr=5.0,
    )
    print("save_instamark_evaluation returned:", eval_id)
    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
