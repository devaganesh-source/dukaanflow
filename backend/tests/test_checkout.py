
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_retailer
from app.database import Base, get_db
from app.main import app
from app.models import Order, Product, RetailerPrice, User


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        retailer = User(
            phone="9000000001",
            name="Test Retailer",
            role="retailer",
            is_active=True,
        )

        db.add(retailer)
        db.flush()
        retailer_id = retailer.id

        db.add_all([
            Product(
                sku="SKU-BS-075",
                name="Glucose Biscuit",
                category="Biscuits",
                pack="Case of 96",
                price_paise=77760,
                stock_cases=340,
                scheme="Buy 10 Get 1",
            ),
            Product(
                sku="SKU-DT-1KG",
                name="Detergent",
                category="Detergent",
                pack="Case of 20",
                price_paise=203000,
                stock_cases=85,
                scheme="3% off 5+",
            ),
        ])

        db.flush()

        db.add_all([
            RetailerPrice(
                retailer_id=retailer_id,
                product_sku="SKU-BS-075",
                price_paise=76500,
            ),
            RetailerPrice(
                retailer_id=retailer_id,
                product_sku="SKU-DT-1KG",
                price_paise=203000,
            ),
        ])

        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    def override_retailer():
        with Session(engine) as db:
            return db.get(User, retailer_id)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_retailer] = override_retailer

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def get_stock(engine, sku):
    with Session(engine) as db:
        return db.get(Product, sku).stock_cases


def test_checkout_applies_free_goods(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1001",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 10,
            }],
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["total_paise"] == 765000
    assert data["items"][0]["free_cases"] == 1
    assert data["items"][0]["total_cases"] == 11

    assert get_stock(engine, "SKU-BS-075") == 329


def test_retry_does_not_deduct_stock_twice(env):
    client, engine = env

    payload = {
        "idempotency_key": "purchase-1002",
        "items": [{
            "sku": "SKU-BS-075",
            "quantity_cases": 10,
        }],
    }

    first = client.post("/api/orders", json=payload)
    second = client.post("/api/orders", json=payload)

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]

    assert get_stock(engine, "SKU-BS-075") == 329


def test_same_key_with_different_cart_is_rejected(env):
    client, engine = env

    client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1003",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 2,
            }],
        },
    )

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1003",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 3,
            }],
        },
    )

    assert response.status_code == 409
    assert get_stock(engine, "SKU-BS-075") == 338


def test_free_goods_cannot_exceed_stock(env):
    client, engine = env

    with Session(engine) as db:
        product = db.get(Product, "SKU-BS-075")
        product.stock_cases = 10
        db.commit()

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1004",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 10,
            }],
        },
    )

    assert response.status_code == 409
    assert get_stock(engine, "SKU-BS-075") == 10


def test_failed_cart_restores_all_stock(env):
    client, engine = env

    with Session(engine) as db:
        product = db.get(Product, "SKU-DT-1KG")
        product.stock_cases = 1
        db.commit()

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1005",
            "items": [
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 10,
                },
                {
                    "sku": "SKU-DT-1KG",
                    "quantity_cases": 5,
                },
            ],
        },
    )

    assert response.status_code == 409

    # The biscuit update must also roll back.
    assert get_stock(engine, "SKU-BS-075") == 340

    with Session(engine) as db:
        assert db.scalar(select(Order)) is None


def test_client_cannot_supply_price(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1006",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 1,
                "unit_price_paise": 1,
            }],
        },
    )

    assert response.status_code == 422
    assert get_stock(engine, "SKU-BS-075") == 340


def test_login_required(env):
    client, _ = env

    app.dependency_overrides.pop(require_retailer)

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1007",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 1,
            }],
        },
    )

    assert response.status_code == 401


def test_multi_item_percentage_discount(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1008",
            "items": [
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 10,
                },
                {
                    "sku": "SKU-DT-1KG",
                    "quantity_cases": 5,
                },
            ],
        },
    )

    assert response.status_code == 201

    data = response.json()

    assert data["subtotal_paise"] == 1780000
    assert data["discount_paise"] == 30450
    assert data["total_paise"] == 1749550

    assert get_stock(engine, "SKU-BS-075") == 329
    assert get_stock(engine, "SKU-DT-1KG") == 80


def test_duplicate_skus_are_rejected(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1009",
            "items": [
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 1,
                },
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 2,
                },
            ],
        },
    )

    assert response.status_code == 422
    assert get_stock(engine, "SKU-BS-075") == 340


def test_order_details_are_retailer_scoped(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1010",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 1,
            }],
        },
    )

    assert response.status_code == 201
    order_id = response.json()["id"]

    own = client.get(f"/api/orders/{order_id}")

    assert own.status_code == 200
    assert own.json()["id"] == order_id

    with Session(engine) as db:
        other = User(
            phone="9000000002",
            name="Other Retailer",
            role="retailer",
            is_active=True,
        )
        db.add(other)
        db.commit()
        other_id = other.id

    def other_retailer():
        with Session(engine) as db:
            return db.get(User, other_id)

    app.dependency_overrides[
        require_retailer
    ] = other_retailer

    forbidden = client.get(f"/api/orders/{order_id}")

    assert forbidden.status_code == 404

    # This retailer has no assigned biscuit price.
    unavailable = client.post(
        "/api/orders",
        json={
            "idempotency_key": "purchase-1011",
            "items": [{
                "sku": "SKU-BS-075",
                "quantity_cases": 1,
            }],
        },
    )

    assert unavailable.status_code == 400


def test_second_order_cannot_oversell_stock(env):
    client, engine = env

    with Session(engine) as db:
        product = db.get(Product, "SKU-BS-075")
        product.stock_cases = 11
        db.commit()

    payload = {
        "items": [
            {
                "sku": "SKU-BS-075",
                "quantity_cases": 10,
            }
        ],
    }

    first = client.post(
        "/api/orders",
        json={
            **payload,
            "idempotency_key": "stock-test-001",
        },
    )

    second = client.post(
        "/api/orders",
        json={
            **payload,
            "idempotency_key": "stock-test-002",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 409
    assert get_stock(engine, "SKU-BS-075") == 0

    with Session(engine) as db:
        orders = db.scalars(select(Order)).all()
        assert len(orders) == 1


def test_checkout_uses_current_retailer_price(env):
    client, engine = env

    with Session(engine) as db:
        price = db.scalar(
            select(RetailerPrice).where(
                RetailerPrice.product_sku == "SKU-BS-075"
            )
        )

        price.price_paise = 70000
        db.commit()

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "price-test-001",
            "items": [
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 1,
                }
            ],
        },
    )

    assert response.status_code == 201

    item = response.json()["items"][0]

    assert item["unit_price_paise"] == 70000
    assert item["total_paise"] == 70000


def test_saved_order_keeps_original_price(env):
    client, engine = env

    response = client.post(
        "/api/orders",
        json={
            "idempotency_key": "snapshot-test-001",
            "items": [
                {
                    "sku": "SKU-BS-075",
                    "quantity_cases": 1,
                }
            ],
        },
    )

    assert response.status_code == 201
    order_id = response.json()["id"]

    with Session(engine) as db:
        price = db.scalar(
            select(RetailerPrice).where(
                RetailerPrice.product_sku == "SKU-BS-075"
            )
        )

        price.price_paise = 90000
        db.commit()

    saved = client.get(f"/api/orders/{order_id}")

    assert saved.status_code == 200
    assert saved.json()["items"][0]["unit_price_paise"] == 76500
    assert saved.json()["total_paise"] == 76500


def test_retry_succeeds_after_stock_changes(env):
    client, engine = env

    payload = {
        "idempotency_key": "retry-test-001",
        "items": [
            {
                "sku": "SKU-BS-075",
                "quantity_cases": 10,
            }
        ],
    }

    first = client.post("/api/orders", json=payload)

    assert first.status_code == 201

    with Session(engine) as db:
        product = db.get(Product, "SKU-BS-075")
        product.stock_cases = 0
        db.commit()

    retry = client.post("/api/orders", json=payload)

    assert retry.status_code == 200
    assert retry.json()["id"] == first.json()["id"]
    assert get_stock(engine, "SKU-BS-075") == 0

    with Session(engine) as db:
        orders = db.scalars(select(Order)).all()
        assert len(orders) == 1
