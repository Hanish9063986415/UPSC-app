from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from app.config.settings import get_settings
from app.db.session import database_enabled
from app.services.evaluation_storage_service import (
    get_instamark_evaluation,
    list_instamark_evaluations,
)
from app.services.wallet_service import (
    WalletBillingUnavailable,
    ensure_instamark_operational,
    get_evaluation_debit_status,
    get_wallet_summary,
    is_instamark_operational,
    instamark_wallet_required,
    maintenance_error_payload,
    wallet_billing_configured,
)

router = APIRouter(prefix="/instamark", tags=["Instamark"])


def _resolve_user_id(
    yantra_user_id: Optional[str],
    x_yantra_user_id: Optional[str],
) -> str:
    user_id = (yantra_user_id or x_yantra_user_id or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="YantraIAS user id required. Pass yantra_user_id query param or X-Yantra-User-Id header.",
        )
    return user_id


@router.get("/wallet")
async def get_wallet(
    yantra_user_id: Optional[str] = Query(None, description="YantraIAS user id"),
    x_yantra_user_id: Optional[str] = Header(None, alias="X-Yantra-User-Id"),
):
    """Wallet credits for the signed-in YantraIAS user."""
    try:
        ensure_instamark_operational()
    except WalletBillingUnavailable as e:
        raise HTTPException(status_code=503, detail=maintenance_error_payload()) from e

    user_id = _resolve_user_id(yantra_user_id, x_yantra_user_id)
    return await get_wallet_summary(user_id)


@router.get("/wallet/debit-status")
async def wallet_debit_status(
    client_transaction_id: str = Query(..., min_length=1, description="Instamark client transaction id"),
    yantra_user_id: Optional[str] = Query(None, description="YantraIAS user id"),
    x_yantra_user_id: Optional[str] = Header(None, alias="X-Yantra-User-Id"),
):
    """Verify whether wallet was debited for a given Instamark evaluation transaction."""
    user_id = _resolve_user_id(yantra_user_id, x_yantra_user_id)
    try:
        return await get_evaluation_debit_status(
            yantra_user_id=user_id,
            client_transaction_id=client_transaction_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except WalletBillingUnavailable as e:
        raise HTTPException(status_code=503, detail=maintenance_error_payload()) from e


@router.get("/evaluations")
async def list_evaluations(
    yantra_user_id: Optional[str] = Query(None, description="YantraIAS user id"),
    x_yantra_user_id: Optional[str] = Header(None, alias="X-Yantra-User-Id"),
    limit: int = Query(50, ge=1, le=200),
):
    """List completed Instamark evaluations for a YantraIAS user."""
    if not database_enabled():
        raise HTTPException(status_code=503, detail=maintenance_error_payload())

    user_id = _resolve_user_id(yantra_user_id, x_yantra_user_id)
    items = await list_instamark_evaluations(user_id, limit=limit)
    return {"count": len(items), "evaluations": items}


@router.get("/evaluations/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    yantra_user_id: Optional[str] = Query(None, description="YantraIAS user id"),
    x_yantra_user_id: Optional[str] = Header(None, alias="X-Yantra-User-Id"),
):
    """Fetch one Instamark evaluation including full analysis JSON."""
    if not database_enabled():
        raise HTTPException(status_code=503, detail=maintenance_error_payload())

    user_id = _resolve_user_id(yantra_user_id, x_yantra_user_id)
    record = await get_instamark_evaluation(evaluation_id, yantra_user_id=user_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return record


@router.get("/storage-status")
async def storage_status():
    settings = get_settings()
    maintenance = instamark_wallet_required() and not is_instamark_operational()
    return {
        "operational": is_instamark_operational(),
        "maintenance": maintenance,
        "database_enabled": database_enabled(),
        "billing_configured": wallet_billing_configured(),
        "database_auto_init": settings.database_auto_init,
        "user_id_header": settings.yantra_user_id_header,
        **(
            {"message": maintenance_error_payload()["message"]}
            if maintenance
            else {}
        ),
    }
