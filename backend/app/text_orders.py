
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import require_retailer
from .database import get_db
from .models import Product, User
from .text_order_ai import (
    AssistedParsedOrder,
    parse_order_with_ai,
)


router = APIRouter(
    prefix="/api/text-orders",
    tags=["text-orders"],
)


class TextOrderRequest(BaseModel):
    text: str = Field(
        min_length=1,
        max_length=2000,
    )


@router.post(
    "/parse",
    response_model=AssistedParsedOrder,
)
def parse_retailer_order(
    payload: TextOrderRequest,
    db: Session = Depends(get_db),
    _retailer: User = Depends(require_retailer),
) -> AssistedParsedOrder:
    if not payload.text.strip():
        raise HTTPException(
            status_code=422,
            detail="Order text cannot be empty",
        )

    products = db.scalars(
        select(Product).order_by(
            Product.name,
            Product.sku,
        )
    ).all()

    try:
        return parse_order_with_ai(
            payload.text,
            products,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error
