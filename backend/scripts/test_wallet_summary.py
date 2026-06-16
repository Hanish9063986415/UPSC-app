import asyncio
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.config.settings import get_settings
from app.db import session as db_session
from app.services.wallet_service import get_wallet_summary


async def main() -> None:
    get_settings.cache_clear()
    await db_session.init_database()

    user_id = "1c104697-4f1e-4919-b48c-19a6307bab35"
    summary = await get_wallet_summary(user_id)
    print("wallet summary:", summary)
    await db_session.close_database()


if __name__ == "__main__":
    asyncio.run(main())
