
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import (
    require_order_desk,
    require_retailer,
    router as auth_router,
)
from .catalog import PRODUCTS
from .database import Base, SessionLocal, engine, get_db
from .models import Product, RetailerPrice, User
from .orders import router as orders_router
from .order_history import router as order_history_router
from .retailer_activity import router as retailer_activity_router
from .order_desk_orders import router as order_desk_orders_router
from .order_desk_status import router as order_desk_status_router
from .order_desk_export import router as order_desk_export_router
from .text_orders import router as text_orders_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        # Seed products only if missing.
        for item in PRODUCTS:
            if db.get(Product, item["sku"]) is None:
                db.add(Product(**item))

        # Demo accounts and prices only in demo mode.
        if os.getenv("DEMO_MODE", "false").lower() == "true":
            demo_users = [
                ("9000000001", "Demo Retailer", "retailer"),
                ("9000000002", "Demo Order Desk", "order_desk"),
                ("9000000003", "Market Corner Kirana", "retailer"),
                ("9000000004", "Old Town Stores", "retailer"),
            ]

            for phone, name, role in demo_users:
                existing = db.scalar(
                    select(User).where(User.phone == phone)
                )

                if existing is None:
                    db.add(
                        User(
                            phone=phone,
                            name=name,
                            role=role,
                        )
                    )

            db.flush()

            # Fictional shops make the inactive dashboard
            # useful on a fresh demo installation.
            demo_retailers = db.scalars(
                select(User).where(
                    User.phone.in_([
                        "9000000001",
                        "9000000003",
                        "9000000004",
                    ]),
                    User.role == "retailer",
                )
            ).all()

            for retailer in demo_retailers:
                for item in PRODUCTS:
                    key = (retailer.id, item["sku"])

                    if db.get(RetailerPrice, key) is None:
                        price = item["price_paise"]

                        if (
                            retailer.phone == "9000000001"
                            and item["sku"] == "SKU-BS-075"
                        ):
                            price = 76500

                        db.add(
                            RetailerPrice(
                                retailer_id=retailer.id,
                                product_sku=item["sku"],
                                price_paise=price,
                            )
                        )

        db.commit()

    yield


app = FastAPI(
    title="DukaanFlow API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.include_router(orders_router)
app.include_router(order_history_router)
app.include_router(retailer_activity_router)
app.include_router(auth_router)
app.include_router(order_desk_orders_router)
app.include_router(order_desk_status_router)
app.include_router(order_desk_export_router)
app.include_router(text_orders_router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


def catalogue_for_retailer(
    db: Session,
    retailer_id: int,
):
    rows = db.execute(
        select(Product, RetailerPrice.price_paise)
        .join(
            RetailerPrice,
            RetailerPrice.product_sku == Product.sku,
        )
        .where(RetailerPrice.retailer_id == retailer_id)
        .order_by(Product.name)
    ).all()

    return {
        "products": [
            {
                "sku": product.sku,
                "name": product.name,
                "category": product.category,
                "pack": product.pack,
                "price_paise": retailer_price,
                "stock_cases": product.stock_cases,
                "scheme": product.scheme,
            }
            for product, retailer_price in rows
        ]
    }


@app.get("/api/products", tags=["catalogue"])
def get_products(
    user: User = Depends(require_retailer),
    db: Session = Depends(get_db),
):
    return catalogue_for_retailer(db, user.id)


@app.get("/api/order-desk/retailers", tags=["order desk"])
def list_retailers(
    user: User = Depends(require_order_desk),
    db: Session = Depends(get_db),
):
    retailers = db.scalars(
        select(User)
        .where(
            User.role == "retailer",
            User.is_active.is_(True),
        )
        .order_by(User.name)
    ).all()

    return {
        "retailers": [
            {"id": retailer.id, "name": retailer.name}
            for retailer in retailers
        ]
    }


@app.get(
    "/api/order-desk/retailers/{retailer_id}/products",
    tags=["order desk"],
)
def get_retailer_catalogue(
    retailer_id: int,
    user: User = Depends(require_order_desk),
    db: Session = Depends(get_db),
):
    retailer = db.get(User, retailer_id)

    if (
        retailer is None
        or retailer.role != "retailer"
        or not retailer.is_active
    ):
        raise HTTPException(
            status_code=404,
            detail="Retailer not found",
        )

    return catalogue_for_retailer(db, retailer_id)
