
import time

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import require_order_desk
from .database import get_db
from .models import Order, User

router = APIRouter(
    prefix="/api/order-desk",
    tags=["order-desk"],
)

INACTIVE_DAYS = 14
SECONDS_PER_DAY = 24 * 60 * 60


class InactiveRetailer(BaseModel):
    id: int
    name: str
    last_order_at: int | None
    days_since_last_order: int | None


class InactiveRetailersResponse(BaseModel):
    as_of: int
    threshold_days: int
    total_active_retailers: int
    inactive_count: int
    retailers: list[InactiveRetailer]


@router.get(
    "/inactive-retailers",
    response_model=InactiveRetailersResponse,
)
def list_inactive_retailers(
    response: Response,
    db: Session = Depends(get_db),
    _desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    now = int(time.time())
    cutoff = now - INACTIVE_DAYS * SECONDS_PER_DAY

    last_order = (
        select(
            Order.retailer_id.label("retailer_id"),
            func.max(Order.created_at).label("last_order_at"),
        )
        .group_by(Order.retailer_id)
        .subquery()
    )

    rows = db.execute(
        select(
            User.id,
            User.name,
            last_order.c.last_order_at,
        )
        .outerjoin(
            last_order,
            last_order.c.retailer_id == User.id,
        )
        .where(
            User.role == "retailer",
            User.is_active.is_(True),
        )
    ).all()

    inactive = []

    for retailer_id, name, last_at in rows:
        if last_at is not None and last_at > cutoff:
            continue

        inactive.append(
            InactiveRetailer(
                id=retailer_id,
                name=name,
                last_order_at=last_at,
                days_since_last_order=(
                    None
                    if last_at is None
                    else max(
                        0,
                        (now - last_at) // SECONDS_PER_DAY,
                    )
                ),
            )
        )

    # Never ordered first, followed by longest-inactive.
    inactive.sort(
        key=lambda retailer: (
            retailer.last_order_at is not None,
            retailer.last_order_at or 0,
            retailer.name.casefold(),
        )
    )

    return InactiveRetailersResponse(
        as_of=now,
        threshold_days=INACTIVE_DAYS,
        total_active_retailers=len(rows),
        inactive_count=len(inactive),
        retailers=inactive,
    )
