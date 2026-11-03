
from fastapi import FastAPI

from .catalog import PRODUCTS

app = FastAPI(
    title="DukaanFlow API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products", tags=["catalogue"])
def get_products():
    return {"products": PRODUCTS}
