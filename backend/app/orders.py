
import time

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import require_retailer
from .database import get_db
from .models import Order, OrderItem, Product, RetailerPrice, User
from .pricing import PricingError, calculate_line


router = APIRouter(tags=["orders"])


class CheckoutItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sku: str = Field(min_length=1, max_length=40)
    quantity_cases: int = Field(
        gt=0,
        le=1000,
        strict=True,
    )


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(
        min_length=8,
        max_length=80,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    items: list[CheckoutItem] = Field(
        min_length=1,
        max_length=50,
    )


class OrderItemResponse(BaseModel):
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


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    retailer_id: int
    status: str
    created_at: int
    subtotal_paise: int
    discount_paise: int
    total_paise: int
    items: list[OrderItemResponse]


def order_matches_request(
    order: Order,
    payload: CheckoutRequest,
) -> bool:
    saved_items = {
        item.product_sku: item.paid_cases
        for item in order.items
    }

    submitted_items = {
        item.sku: item.quantity_cases
        for item in payload.items
    }

    return saved_items == submitted_items


@router.post(
    "/api/orders",
    response_model=OrderResponse,
    status_code=201,
)
def submit_order(
    payload: CheckoutRequest,
    response: Response,
    db: Session = Depends(get_db),
    retailer: User = Depends(require_retailer),
):
    return create_order_for_retailer(
        payload=payload,
        response=response,
        db=db,
        retailer=retailer,
    )


def create_order_for_retailer(
    *,
    payload: CheckoutRequest,
    response: Response,
    db: Session,
    retailer: User,
    initial_status: str = "submitted",
) -> Order:
    """Shared validated checkout for retailer and salesman visit orders."""
    if initial_status not in {"submitted", "on_hold"}:
        raise ValueError("Invalid initial order status")

    skus = [item.sku for item in payload.items]

    if len(skus) != len(set(skus)):
        raise HTTPException(
            422,
            "Each SKU may appear only once",
        )

    def find_existing():
        return db.scalar(
            select(Order).where(
                Order.retailer_id == retailer.id,
                Order.idempotency_key == payload.idempotency_key,
            )
        )

    # Return an existing order before checking current stock.
    existing = find_existing()

    if existing is not None:
        if not order_matches_request(existing, payload):
            raise HTTPException(
                409,
                "Request key already used for a different cart",
            )

        response.status_code = 200
        return existing

    lines: list[OrderItem] = []

    try:
        # Consistent SKU ordering reduces lock-order conflicts.
        for requested in sorted(
            payload.items,
            key=lambda item: item.sku,
        ):
            row = db.execute(
                select(Product, RetailerPrice.price_paise)
                .join(
                    RetailerPrice,
                    RetailerPrice.product_sku == Product.sku,
                )
                .where(
                    Product.sku == requested.sku,
                    RetailerPrice.retailer_id == retailer.id,
                )
            ).one_or_none()

            if row is None:
                raise HTTPException(
                    400,
                    "Product unavailable for this retailer",
                )

            product, retailer_price = row

            # Never use a price supplied by the browser.
            try:
                quote = calculate_line(
                    sku=product.sku,
                    quantity_cases=requested.quantity_cases,
                    unit_price_paise=retailer_price,
                    stock_cases=product.stock_cases,
                )
            except PricingError as error:
                raise HTTPException(
                    409,
                    str(error),
                ) from error

            # Atomic stock check and decrement.
            result = db.execute(
                update(Product)
                .where(
                    Product.sku == requested.sku,
                    Product.stock_cases >= quote.total_cases,
                )
                .values(
                    stock_cases=(
                        Product.stock_cases - quote.total_cases
                    )
                )
            )

            if result.rowcount != 1:
                raise HTTPException(
                    409,
                    f"Insufficient stock for {requested.sku}",
                )

            lines.append(
                OrderItem(
                    product_sku=product.sku,
                    product_name=product.name,
                    pack=product.pack,
                    paid_cases=quote.paid_cases,
                    free_cases=quote.free_cases,
                    total_cases=quote.total_cases,
                    unit_price_paise=quote.unit_price_paise,
                    subtotal_paise=quote.subtotal_paise,
                    discount_paise=quote.discount_paise,
                    total_paise=quote.total_paise,
                )
            )

        subtotal = sum(
            line.subtotal_paise for line in lines
        )
        discount = sum(
            line.discount_paise for line in lines
        )

        order = Order(
            retailer_id=retailer.id,
            idempotency_key=payload.idempotency_key,
            status=initial_status,
            created_at=int(time.time()),
            subtotal_paise=subtotal,
            discount_paise=discount,
            total_paise=subtotal - discount,
            items=lines,
        )

        db.add(order)

        # Stock updates and order inserts are one transaction.
        db.commit()

    except IntegrityError as error:
        db.rollback()

        # Another request may have inserted the same key.
        previous = find_existing()

        if previous is not None:
            if not order_matches_request(previous, payload):
                raise HTTPException(
                    409,
                    "Request key already used for a different cart",
                ) from error

            response.status_code = 200
            return previous

        raise HTTPException(
            409,
            "Order could not be saved",
        ) from error

    except Exception:
        db.rollback()
        raise

    return order


@router.get(
    "/api/orders/{order_id}",
    response_model=OrderResponse,
)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    retailer: User = Depends(require_retailer),
):
    order = db.scalar(
        select(Order).where(
            Order.id == order_id,
            Order.retailer_id == retailer.id,
        )
    )

    if order is None:
        raise HTTPException(404, "Order not found")

    return order
