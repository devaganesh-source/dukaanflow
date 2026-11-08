
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import require_retailer
from .database import get_db
from .models import Order, User

router = APIRouter(tags=["orders"])


class OrderHistoryEntry(BaseModel):
    id: int
    status: str
    created_at: int
    total_paise: int


class OrderHistoryResponse(BaseModel):
    orders: list[OrderHistoryEntry]
    total: int
    page: int
    page_size: int


@router.get(
    "/api/orders",
    response_model=OrderHistoryResponse,
)
def list_my_orders(
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    retailer: User = Depends(require_retailer),
):
    response.headers["Cache-Control"] = "private, no-store"

    total = db.scalar(
        select(func.count(Order.id)).where(
            Order.retailer_id == retailer.id
        )
    ) or 0

    orders = db.scalars(
        select(Order)
        .where(Order.retailer_id == retailer.id)
        .order_by(
            Order.created_at.desc(),
            Order.id.desc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return OrderHistoryResponse(
        orders=[
            OrderHistoryEntry(
                id=order.id,
                status=order.status,
                created_at=order.created_at,
                total_paise=order.total_paise,
            )
            for order in orders
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
