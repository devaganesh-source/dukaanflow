
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import require_order_desk
from .database import get_db
from .models import Order, OrderItem, User


router = APIRouter(
    prefix="/api/order-desk",
    tags=["order-desk"],
)

OrderStatus = Literal["submitted", "on_hold", "exported"]


class DashboardSummary(BaseModel):
    total_orders: int
    total_value_paise: int
    submitted: int
    on_hold: int
    exported: int


class DashboardOrder(BaseModel):
    id: int
    retailer_id: int
    retailer_name: str
    status: str
    created_at: int
    subtotal_paise: int
    discount_paise: int
    total_paise: int


class DashboardOrdersResponse(BaseModel):
    orders: list[DashboardOrder]
    total: int
    page: int
    page_size: int
    summary: DashboardSummary


class DashboardOrderItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_sku: str
    product_name: str
    pack: str
    paid_cases: int
    free_cases: int
    total_cases: int
    unit_price_paise: int
    subtotal_paise: int
    discount_paise: int
    total_paise: int


class DashboardOrderDetail(DashboardOrder):
    items: list[DashboardOrderItem]


def serialize_order(order: Order, retailer_name: str):
    return DashboardOrder(
        id=order.id,
        retailer_id=order.retailer_id,
        retailer_name=retailer_name,
        status=order.status,
        created_at=order.created_at,
        subtotal_paise=order.subtotal_paise,
        discount_paise=order.discount_paise,
        total_paise=order.total_paise,
    )


def get_dashboard_summary(db: Session) -> DashboardSummary:
    rows = db.execute(
        select(
            Order.status,
            func.count(Order.id),
            func.coalesce(func.sum(Order.total_paise), 0),
        ).group_by(Order.status)
    ).all()

    counts = {
        "submitted": 0,
        "on_hold": 0,
        "exported": 0,
    }

    total_orders = 0
    total_value = 0

    for status, count, value in rows:
        counts[status] = count
        total_orders += count
        total_value += value

    return DashboardSummary(
        total_orders=total_orders,
        total_value_paise=total_value,
        submitted=counts["submitted"],
        on_hold=counts["on_hold"],
        exported=counts["exported"],
    )


@router.get(
    "/orders",
    response_model=DashboardOrdersResponse,
)
def list_desk_orders(
    response: Response,
    status: OrderStatus | None = Query(default=None),
    retailer_id: int | None = Query(default=None, gt=0),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    _desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    filters = []

    if status is not None:
        filters.append(Order.status == status)

    if retailer_id is not None:
        filters.append(Order.retailer_id == retailer_id)

    total = db.scalar(
        select(func.count(Order.id))
        .select_from(Order)
        .where(*filters)
    ) or 0

    rows = db.execute(
        select(Order, User.name)
        .join(User, User.id == Order.retailer_id)
        .where(*filters)
        .order_by(
            Order.created_at.desc(),
            Order.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return DashboardOrdersResponse(
        orders=[
            serialize_order(order, name)
            for order, name in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
        summary=get_dashboard_summary(db),
    )


@router.get(
    "/orders/{order_id}",
    response_model=DashboardOrderDetail,
)
def get_desk_order(
    order_id: int,
    response: Response,
    db: Session = Depends(get_db),
    _desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    row = db.execute(
        select(Order, User.name)
        .join(User, User.id == Order.retailer_id)
        .where(Order.id == order_id)
    ).one_or_none()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Order not found",
        )

    order, retailer_name = row

    items = db.scalars(
        select(OrderItem)
        .where(OrderItem.order_id == order.id)
        .order_by(OrderItem.id)
    ).all()

    order_data = serialize_order(
        order,
        retailer_name,
    )

    return DashboardOrderDetail(
        **order_data.model_dump(),
        items=[
            DashboardOrderItem.model_validate(item)
            for item in items
        ],
    )
