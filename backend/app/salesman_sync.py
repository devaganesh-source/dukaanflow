"""Server-side synchronization of device drafts from assigned salesman visits.

No browser-provided price, stock or scheme is trusted. Every newly synced
visit is held for distributor review; an automated credit limit does not yet
exist in DukaanFlow.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from .auth import require_salesman
from .database import get_db
from .models import User
from .orders import (
    CheckoutItem,
    CheckoutRequest,
    OrderResponse,
    create_order_for_retailer,
)
from .salesman import assigned_retailer

router = APIRouter(prefix="/api/salesman", tags=["salesman"])


class SyncDraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    retailer_id: int = Field(strict=True, gt=0)
    draft_id: UUID
    items: list[CheckoutItem] = Field(min_length=1, max_length=50)


@router.post("/sync", response_model=OrderResponse, status_code=201)
def sync_draft(
    payload: SyncDraftRequest,
    response: Response,
    db: Session = Depends(get_db),
    salesman: User = Depends(require_salesman),
):
    response.headers["Cache-Control"] = "private, no-store"

    # Check assignment again for every request, including retries.
    retailer = assigned_retailer(
        db, salesman.id, payload.retailer_id
    )

    checkout = CheckoutRequest(
        idempotency_key=f"visit-{salesman.id}-{payload.draft_id.hex}",
        items=payload.items,
    )

    # The existing checkout engine owns the transaction, atomic stock
    # reservation, live prices, schemes, and duplicate-key protection.
    # All salesman orders enter the distributor hold queue for manual
    # credit review instead of proceeding directly to export/loading.
    return create_order_for_retailer(
        payload=checkout,
        response=response,
        db=db,
        retailer=retailer,
        initial_status="on_hold",
    )
