
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_order_desk
from app.database import Base, get_db
from app.main import app
from app.models import Order, OrderItem, OrderStatusEvent, User


@pytest.fixture
def status_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        retailer = User(
            phone="9000000021",
            name="Test Retailer",
            role="retailer",
            is_active=True,
        )
        desk = User(
            phone="9000000022",
            name="Test Desk Staff",
            role="order_desk",
            is_active=True,
        )

        db.add_all([retailer, desk])
        db.flush()

        desk_id = desk.id

        order = Order(
            retailer_id=retailer.id,
            idempotency_key="status-test-001",
            status="submitted",
            created_at=1700000000,
            subtotal_paise=76500,
            discount_paise=0,
            total_paise=76500,
            items=[
                OrderItem(
                    product_sku="SKU-BS-075",
                    product_name="Glucose Biscuit",
                    pack="Case of 96",
                    paid_cases=1,
                    free_cases=0,
                    total_cases=1,
                    unit_price_paise=76500,
                    subtotal_paise=76500,
                    discount_paise=0,
                    total_paise=76500,
                )
            ],
        )

        db.add(order)
        db.commit()

        order_id = order.id

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
            yield client, engine, order_id
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def change_payload(
    expected="submitted",
    new="on_hold",
    reason="Awaiting distributor verification",
):
    return {
        "expected_status": expected,
        "new_status": new,
        "reason": reason,
    }


def test_put_order_on_hold(status_env):
    client, engine, order_id = status_env

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(),
    )

    assert response.status_code == 200

    event = response.json()
    assert event["old_status"] == "submitted"
    assert event["new_status"] == "on_hold"
    assert event["actor_name"] == "Test Desk Staff"

    with Session(engine) as db:
        assert db.get(Order, order_id).status == "on_hold"
        assert db.scalar(
            select(func.count(OrderStatusEvent.id))
        ) == 1


def test_resume_order(status_env):
    client, engine, order_id = status_env

    with Session(engine) as db:
        db.get(Order, order_id).status = "on_hold"
        db.commit()

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(
            expected="on_hold",
            new="submitted",
            reason="Verification completed",
        ),
    )

    assert response.status_code == 200

    with Session(engine) as db:
        assert db.get(Order, order_id).status == "submitted"


def test_stale_status_is_rejected(status_env):
    client, engine, order_id = status_env
    url = f"/api/order-desk/orders/{order_id}/status"

    first = client.patch(url, json=change_payload())
    second = client.patch(url, json=change_payload())

    assert first.status_code == 200
    assert second.status_code == 409

    with Session(engine) as db:
        assert db.scalar(
            select(func.count(OrderStatusEvent.id))
        ) == 1


def test_exported_order_cannot_change(status_env):
    client, engine, order_id = status_env

    with Session(engine) as db:
        db.get(Order, order_id).status = "exported"
        db.commit()

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(),
    )

    assert response.status_code == 409


def test_same_status_is_rejected(status_env):
    client, _, order_id = status_env

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(
            expected="submitted",
            new="submitted",
        ),
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "payload",
    [
        change_payload(reason=""),
        change_payload(reason="   "),
        change_payload(reason="x" * 301),
        change_payload(new="exported"),
    ],
)
def test_invalid_status_payload(status_env, payload):
    client, _, order_id = status_env

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=payload,
    )

    assert response.status_code == 422


def test_missing_order_returns_404(status_env):
    client, _, _ = status_env

    assert client.patch(
        "/api/order-desk/orders/99999/status",
        json=change_payload(),
    ).status_code == 404

    assert client.get(
        "/api/order-desk/orders/99999/history"
    ).status_code == 404


def test_history_records_both_changes(status_env):
    client, _, order_id = status_env

    client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(
            reason="Checking inventory",
        ),
    )

    client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(
            expected="on_hold",
            new="submitted",
            reason="Inventory approved",
        ),
    )

    response = client.get(
        f"/api/order-desk/orders/{order_id}/history"
    )

    assert response.status_code == 200

    events = response.json()

    assert len(events) == 2
    assert events[0]["new_status"] == "submitted"
    assert events[0]["reason"] == "Inventory approved"
    assert events[1]["new_status"] == "on_hold"
    assert events[1]["reason"] == "Checking inventory"
    assert all(
        event["actor_name"] == "Test Desk Staff"
        for event in events
    )


def test_anonymous_cannot_change_status(status_env):
    client, _, order_id = status_env

    app.dependency_overrides.pop(require_order_desk)

    response = client.patch(
        f"/api/order-desk/orders/{order_id}/status",
        json=change_payload(),
    )

    assert response.status_code == 401


def test_new_order_has_empty_history(status_env):
    client, _, order_id = status_env

    response = client.get(
        f"/api/order-desk/orders/{order_id}/history"
    )

    assert response.status_code == 200
    assert response.json() == []
