
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_order_desk
from app.database import Base, get_db
from app.main import app
from app.models import Order, OrderItem, User


@pytest.fixture
def desk_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        retailer_a = User(
            phone="9000000011",
            name="Retailer Alpha",
            role="retailer",
            is_active=True,
        )

        retailer_b = User(
            phone="9000000012",
            name="Retailer Beta",
            role="retailer",
            is_active=True,
        )

        desk_user = User(
            phone="9000000013",
            name="Order Desk",
            role="order_desk",
            is_active=True,
        )

        db.add_all([
            retailer_a,
            retailer_b,
            desk_user,
        ])
        db.flush()

        retailer_a_id = retailer_a.id
        retailer_b_id = retailer_b.id
        desk_id = desk_user.id

        sample_orders = [
            (retailer_a_id, "submitted", 100, 765000),
            (retailer_b_id, "on_hold", 300, 984550),
            (retailer_a_id, "submitted", 200, 76500),
            (retailer_b_id, "exported", 400, 100000),
        ]

        for index, (
            retailer_id,
            status,
            created_at,
            total,
        ) in enumerate(sample_orders, start=1):
            db.add(
                Order(
                    retailer_id=retailer_id,
                    idempotency_key=f"desk-test-{index}",
                    status=status,
                    created_at=created_at,
                    subtotal_paise=total,
                    discount_paise=0,
                    total_paise=total,
                    items=[
                        OrderItem(
                            product_sku="SKU-TEST",
                            product_name="Sample Product",
                            pack="Case of 10",
                            paid_cases=1,
                            free_cases=0,
                            total_cases=1,
                            unit_price_paise=total,
                            subtotal_paise=total,
                            discount_paise=0,
                            total_paise=total,
                        )
                    ],
                )
            )

        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    def override_desk():
        with Session(engine) as db:
            return db.get(User, desk_id)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_order_desk] = override_desk

    try:
        with TestClient(app) as client:
            yield client, {
                "retailer_a": retailer_a_id,
                "retailer_b": retailer_b_id,
            }
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_dashboard_lists_orders_newest_first(desk_env):
    client, _ = desk_env

    response = client.get("/api/order-desk/orders")

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 4
    assert len(data["orders"]) == 4

    assert [
        item["created_at"]
        for item in data["orders"]
    ] == [400, 300, 200, 100]

    assert data["summary"] == {
        "total_orders": 4,
        "total_value_paise": 1926050,
        "submitted": 2,
        "on_hold": 1,
        "exported": 1,
    }

    assert (
        response.headers["cache-control"]
        == "private, no-store"
    )


def test_filter_orders_by_status(desk_env):
    client, _ = desk_env

    response = client.get(
        "/api/order-desk/orders",
        params={"status": "submitted"},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 2
    assert all(
        item["status"] == "submitted"
        for item in data["orders"]
    )

    # Summary remains global.
    assert data["summary"]["total_orders"] == 4


def test_filter_orders_by_retailer(desk_env):
    client, ids = desk_env

    response = client.get(
        "/api/order-desk/orders",
        params={"retailer_id": ids["retailer_a"]},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["total"] == 2
    assert all(
        item["retailer_name"] == "Retailer Alpha"
        for item in data["orders"]
    )


def test_dashboard_pagination(desk_env):
    client, _ = desk_env

    first = client.get(
        "/api/order-desk/orders",
        params={"page": 1, "page_size": 2},
    )

    second = client.get(
        "/api/order-desk/orders",
        params={"page": 2, "page_size": 2},
    )

    assert first.status_code == 200
    assert second.status_code == 200

    assert [
        item["created_at"]
        for item in first.json()["orders"]
    ] == [400, 300]

    assert [
        item["created_at"]
        for item in second.json()["orders"]
    ] == [200, 100]


def test_order_details_include_items(desk_env):
    client, _ = desk_env

    response = client.get(
        "/api/order-desk/orders/1"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["id"] == 1
    assert data["retailer_name"] == "Retailer Alpha"
    assert data["total_paise"] == 765000

    assert len(data["items"]) == 1
    assert data["items"][0]["product_name"] == "Sample Product"
    assert data["items"][0]["paid_cases"] == 1

    # Internal request keys are not exposed.
    assert "idempotency_key" not in data


def test_unknown_order_returns_404(desk_env):
    client, _ = desk_env

    response = client.get(
        "/api/order-desk/orders/99999"
    )

    assert response.status_code == 404


def test_order_desk_routes_require_login(desk_env):
    client, _ = desk_env

    # Restore the real authentication dependency.
    app.dependency_overrides.pop(require_order_desk)

    assert (
        client.get("/api/order-desk/orders").status_code
        == 401
    )

    assert (
        client.get("/api/order-desk/orders/1").status_code
        == 401
    )


@pytest.mark.parametrize(
    "params",
    [
        {"status": "invalid"},
        {"page": 0},
        {"page_size": 51},
        {"retailer_id": 0},
    ],
)
def test_invalid_filters_are_rejected(desk_env, params):
    client, _ = desk_env

    response = client.get(
        "/api/order-desk/orders",
        params=params,
    )

    assert response.status_code == 422
