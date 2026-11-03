
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.catalog import PRODUCTS
from app.database import Base, get_db
from app.main import app
from app.models import Product


@pytest.fixture
def client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(test_engine)

    with Session(test_engine) as db:
        db.add_all(Product(**item) for item in PRODUCTS)
        db.commit()

    def override_get_db():
        with Session(test_engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()


def test_health(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_catalogue(client):
    response = client.get("/api/products")

    assert response.status_code == 200

    products = response.json()["products"]

    assert len(products) == 6

    assert len(
        {product["sku"] for product in products}
    ) == 6

    biscuit = next(
        product
        for product in products
        if product["sku"] == "SKU-BS-075"
    )

    assert biscuit["price_paise"] == 77760
    assert biscuit["stock_cases"] == 340

    for product in products:
        assert product["price_paise"] > 0
        assert product["stock_cases"] >= 0
