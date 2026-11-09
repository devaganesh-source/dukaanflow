"""Salesman-scoped shop and catalogue snapshots for later offline capture.

These endpoints only read the database. Checkout and synchronization are
implemented separately so a cached snapshot cannot become an authority.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import require_salesman
from .database import get_db
from .models import Product, RetailerPrice, SalesmanRetailer, User

router = APIRouter(prefix="/api/salesman", tags=["salesman"])


class AssignedShop(BaseModel):
    id: int
    name: str


class AssignedShopsResponse(BaseModel):
    shops: list[AssignedShop]
    as_of: int


class SnapshotProduct(BaseModel):
    sku: str
    name: str
    category: str
    pack: str
    price_paise: int
    stock_cases: int
    scheme: str | None


class RetailerCatalogueResponse(BaseModel):
    retailer: AssignedShop
    products: list[SnapshotProduct]
    as_of: int
    snapshot_only: bool = True


def assigned_retailer(
    db: Session,
    salesman_id: int,
    retailer_id: int,
) -> User:
    retailer = db.scalar(
        select(User)
        .join(
            SalesmanRetailer,
            SalesmanRetailer.retailer_id == User.id,
        )
        .where(
            SalesmanRetailer.salesman_id == salesman_id,
            User.id == retailer_id,
            User.role == "retailer",
            User.is_active.is_(True),
        )
    )
    if retailer is None:
        # Same 404 for unassigned, disabled and nonexistent shops.
        raise HTTPException(404, "Retailer not found")
    return retailer


@router.get("/retailers", response_model=AssignedShopsResponse)
def list_assigned_shops(
    response: Response,
    db: Session = Depends(get_db),
    salesman: User = Depends(require_salesman),
):
    response.headers["Cache-Control"] = "private, no-store"

    retailers = db.scalars(
        select(User)
        .join(
            SalesmanRetailer,
            SalesmanRetailer.retailer_id == User.id,
        )
        .where(
            SalesmanRetailer.salesman_id == salesman.id,
            User.role == "retailer",
            User.is_active.is_(True),
        )
        .order_by(User.name, User.id)
    ).all()

    return AssignedShopsResponse(
        as_of=int(time.time()),
        shops=[AssignedShop(id=shop.id, name=shop.name) for shop in retailers],
    )


@router.get(
    "/retailers/{retailer_id}/catalogue",
    response_model=RetailerCatalogueResponse,
)
def get_assigned_catalogue(
    retailer_id: int,
    response: Response,
    db: Session = Depends(get_db),
    salesman: User = Depends(require_salesman),
):
    response.headers["Cache-Control"] = "private, no-store"
    retailer = assigned_retailer(db, salesman.id, retailer_id)

    rows = db.execute(
        select(Product, RetailerPrice.price_paise)
        .join(
            RetailerPrice,
            RetailerPrice.product_sku == Product.sku,
        )
        .where(RetailerPrice.retailer_id == retailer.id)
        .order_by(Product.name, Product.sku)
    ).all()

    return RetailerCatalogueResponse(
        retailer=AssignedShop(id=retailer.id, name=retailer.name),
        as_of=int(time.time()),
        products=[
            SnapshotProduct(
                sku=product.sku,
                name=product.name,
                category=product.category,
                pack=product.pack,
                price_paise=price,
                stock_cases=product.stock_cases,
                scheme=product.scheme,
            )
            for product, price in rows
        ],
    )
