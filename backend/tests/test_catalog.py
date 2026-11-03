
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_catalogue():
    response = client.get("/api/products")

    assert response.status_code == 200

    products = response.json()["products"]

    assert len(products) == 6
    assert len({p["sku"] for p in products}) == len(products)

    for product in products:
        assert product["price_paise"] > 0
        assert product["stock_cases"] >= 0
        assert isinstance(product["price_paise"], int)
