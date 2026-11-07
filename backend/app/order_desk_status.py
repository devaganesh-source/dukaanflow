
import time
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .auth import require_order_desk
from .database import get_db
from .models import Order, OrderStatusEvent, User


router = APIRouter(
    prefix="/api/order-desk/orders",
    tags=["order-desk"],
)

EditableStatus = Literal["submitted", "on_hold"]

Reason = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=3,
        max_length=300,
    ),
]


class StatusChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_status: EditableStatus
    new_status: EditableStatus
    reason: Reason


class StatusEventResponse(BaseModel):
    id: int
    order_id: int
    actor_name: str
    old_status: str
    new_status: str
    reason: str
    changed_at: int


@router.patch(
    "/{order_id}/status",
    response_model=StatusEventResponse,
)
def change_order_status(
    order_id: int,
    payload: StatusChangeRequest,
    response: Response,
    db: Session = Depends(get_db),
    desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    current = db.scalar(
        select(Order.status).where(Order.id == order_id)
    )

    if current is None:
        raise HTTPException(404, "Order not found")

    if current == "exported":
        raise HTTPException(
            409,
            "Exported orders cannot be changed",
        )

    if current != payload.expected_status:
        raise HTTPException(
            409,
            "Order status changed. Refresh and try again",
        )

    if payload.new_status == current:
        raise HTTPException(
            409,
            "Order already has this status",
        )

    # Only these two transitions are allowed:
    # submitted -> on_hold
    # on_hold -> submitted
    if (current, payload.new_status) not in {
        ("submitted", "on_hold"),
        ("on_hold", "submitted"),
    }:
        raise HTTPException(
            409,
            "Invalid order status transition",
        )

    # Compare-and-set prevents stale updates.
    result = db.execute(
        update(Order)
        .where(
            Order.id == order_id,
            Order.status == payload.expected_status,
        )
        .values(status=payload.new_status)
        .execution_options(synchronize_session=False)
    )

    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            409,
            "Order was modified by another request",
        )

    event = OrderStatusEvent(
        order_id=order_id,
        actor_user_id=desk.id,
        old_status=current,
        new_status=payload.new_status,
        reason=payload.reason,
        changed_at=int(time.time()),
    )

    try:
        db.add(event)
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise

    return StatusEventResponse(
        id=event.id,
        order_id=order_id,
        actor_name=desk.name,
        old_status=event.old_status,
        new_status=event.new_status,
        reason=event.reason,
        changed_at=event.changed_at,
    )


@router.get(
    "/{order_id}/history",
    response_model=list[StatusEventResponse],
)
def get_order_status_history(
    order_id: int,
    response: Response,
    db: Session = Depends(get_db),
    _desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    if db.get(Order, order_id) is None:
        raise HTTPException(404, "Order not found")

    rows = db.execute(
        select(OrderStatusEvent, User.name)
        .join(
            User,
            User.id == OrderStatusEvent.actor_user_id,
        )
        .where(OrderStatusEvent.order_id == order_id)
        .order_by(
            OrderStatusEvent.changed_at.desc(),
            OrderStatusEvent.id.desc(),
        )
    ).all()

    return [
        StatusEventResponse(
            id=event.id,
            order_id=event.order_id,
            actor_name=actor_name,
            old_status=event.old_status,
            new_status=event.new_status,
            reason=event.reason,
            changed_at=event.changed_at,
        )
        for event, actor_name in rows
    ]
