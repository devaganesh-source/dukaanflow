
"""Read-only distributor van-loading preview."""

import time
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import require_order_desk
from .database import get_db
from .models import Order, OrderItem, User


router = APIRouter(
    prefix="/api/order-desk",
    tags=["order-desk"],
)

OrderId = Annotated[int, Field(strict=True, gt=0)]
ELIGIBLE_STATUSES = {"submitted", "exported"}


class LoadingListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    order_ids: list[OrderId] = Field(
        min_length=1,
        max_length=50,
    )

    @model_validator(mode="after")
    def no_duplicate_orders(self):
        if len(self.order_ids) != len(set(self.order_ids)):
            raise ValueError("Order IDs must be unique")

        return self


class LoadingLine(BaseModel):
    product_sku: str
    product_name: str
    pack: str
    paid_cases: int
    free_cases: int
    total_cases: int


class LoadingOrder(BaseModel):
    order_id: int
    retailer_id: int
    retailer_name: str
    status: str
    items: list[LoadingLine]


class LoadingListResponse(BaseModel):
    generated_at: int
    order_count: int
    retailer_count: int
    paid_cases: int
    free_cases: int
    total_cases: int
    lines: list[LoadingLine]
    orders: list[LoadingOrder]


@router.post(
    "/loading-list/preview",
    response_model=LoadingListResponse,
)
def preview_loading_list(
    payload: LoadingListRequest,
    response: Response,
    db: Session = Depends(get_db),
    _desk: User = Depends(require_order_desk),
):
    response.headers["Cache-Control"] = "private, no-store"

    rows = db.execute(
        select(Order, User.name)
        .join(User, User.id == Order.retailer_id)
        .where(Order.id.in_(payload.order_ids))
    ).all()

    by_id = {
        order.id: (order, retailer_name)
        for order, retailer_name in rows
    }

    if len(by_id) != len(payload.order_ids):
        raise HTTPException(
            404,
            "One or more orders were not found",
        )

    if any(
        order.status not in ELIGIBLE_STATUSES
        for order, _ in by_id.values()
    ):
        raise HTTPException(
            409,
            (
                "Selection contains an on-hold or otherwise "
                "ineligible order. Refresh and try again"
            ),
        )

    saved_items = db.scalars(
        select(OrderItem)
        .where(OrderItem.order_id.in_(payload.order_ids))
        .order_by(
            OrderItem.order_id,
            OrderItem.product_sku,
        )
    ).all()

    items_by_order: dict[int, list[LoadingLine]] = (
        defaultdict(list)
    )

    # Keep different historical pack sizes separate.
    totals: dict[tuple[str, str], LoadingLine] = {}

    for item in saved_items:
        line = LoadingLine(
            product_sku=item.product_sku,
            product_name=item.product_name,
            pack=item.pack,
            paid_cases=item.paid_cases,
            free_cases=item.free_cases,
            total_cases=item.total_cases,
        )

        items_by_order[item.order_id].append(line)

        key = (item.product_sku, item.pack)
        aggregate = totals.get(key)

        if aggregate is None:
            totals[key] = line.model_copy()
        else:
            aggregate.paid_cases += item.paid_cases
            aggregate.free_cases += item.free_cases
            aggregate.total_cases += item.total_cases

    orders = [
        LoadingOrder(
            order_id=order_id,
            retailer_id=by_id[order_id][0].retailer_id,
            retailer_name=by_id[order_id][1],
            status=by_id[order_id][0].status,
            items=items_by_order[order_id],
        )
        for order_id in payload.order_ids
    ]

    lines = sorted(
        totals.values(),
        key=lambda line: (
            line.product_name.casefold(),
            line.product_sku,
            line.pack,
        ),
    )

    return LoadingListResponse(
        generated_at=int(time.time()),
        order_count=len(orders),
        retailer_count=len({
            order.retailer_id
            for order in orders
        }),
        paid_cases=sum(line.paid_cases for line in lines),
        free_cases=sum(line.free_cases for line in lines),
        total_cases=sum(line.total_cases for line in lines),
        lines=lines,
        orders=orders,
    )
