
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_order_desk
from .database import get_db
from .models import (
    Order,
    OrderExport,
    OrderStatusEvent,
    User,
)
from .tally_export import build_tally_xml


router = APIRouter(
    prefix="/api/order-desk/orders",
    tags=["order-desk"],
)


def download_response(order_id: int, xml: str) -> Response:
    return Response(
        content=xml.encode("utf-8"),
        media_type="application/xml",
        headers={
            "Content-Disposition": (
                f'attachment; filename="dukaanflow-order-{order_id}.xml"'
            ),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/{order_id}/export")
def export_order(
    order_id: int,
    db: Session = Depends(get_db),
    desk: User = Depends(require_order_desk),
):
    if order_id <= 0:
        raise HTTPException(404, "Order not found")

    row = db.execute(
        select(Order, User.name)
        .join(User, User.id == Order.retailer_id)
        .where(Order.id == order_id)
    ).one_or_none()

    if row is None:
        raise HTTPException(404, "Order not found")

    order, retailer_name = row

    # Re-download the exact file previously generated.
    saved = db.get(OrderExport, order_id)

    if saved is not None:
        return download_response(
            order_id,
            saved.xml_payload,
        )

    if order.status == "exported":
        raise HTTPException(
            409,
            "Order is marked exported but its file is missing",
        )

    if order.status != "submitted":
        raise HTTPException(
            409,
            "Only submitted orders can be exported",
        )

    try:
        xml = build_tally_xml(
            order,
            retailer_name,
        )
    except ValueError as error:
        raise HTTPException(
            409,
            str(error),
        ) from error

    # The status can change only from submitted.
    result = db.execute(
        update(Order)
        .where(
            Order.id == order_id,
            Order.status == "submitted",
        )
        .values(status="exported")
        .execution_options(synchronize_session=False)
    )

    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            409,
            "Order status changed. Refresh and try again",
        )

    now = int(time.time())

    db.add(
        OrderExport(
            order_id=order_id,
            created_by=desk.id,
            created_at=now,
            xml_payload=xml,
        )
    )

    db.add(
        OrderStatusEvent(
            order_id=order_id,
            actor_user_id=desk.id,
            old_status="submitted",
            new_status="exported",
            reason="Tally Sales Order XML generated",
            changed_at=now,
        )
    )

    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()

        # A concurrent request may have generated it.
        saved = db.get(OrderExport, order_id)

        if saved is not None:
            return download_response(
                order_id,
                saved.xml_payload,
            )

        raise HTTPException(
            409,
            "Export could not be completed",
        ) from error

    return download_response(order_id, xml)
