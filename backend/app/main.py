
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from .catalog import PRODUCTS
from .database import Base, SessionLocal, engine, get_db
from .models import Product


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        for item in PRODUCTS:
            if db.get(Product, item["sku"]) is None:
                db.add(Product(**item))

        db.commit()

    yield


app = FastAPI(
    title="DukaanFlow API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products", tags=["catalogue"])
def get_products(db: Session = Depends(get_db)):
    products = db.scalars(
        select(Product).order_by(Product.name)
    ).all()

    return {
        "products": [
            {
                "sku": p.sku,
                "name": p.name,
                "category": p.category,
                "pack": p.pack,
                "price_paise": p.price_paise,
                "stock_cases": p.stock_cases,
                "scheme": p.scheme,
            }
            for p in products
        ]
    }
