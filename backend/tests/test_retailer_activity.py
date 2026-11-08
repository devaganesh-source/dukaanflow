
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import current_user, require_order_desk
from app.database import Base, get_db
from app.main import app
from app.models import Order, User
from app import retailer_activity

NOW = 1_780_000_000
DAY = 24 * 60 * 60


@pytest.fixture
def activity_env(monkeypatch):
    monkeypatch.setattr(
        retailer_activity.time,
        "time",
        lambda: NOW,
    )

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        users = [
            User(
                phone=f"90000007{i:02}",
                name=name,
                role=role,
                is_active=active,
            )
            for i, (name, role, active) in enumerate(
                [
                    ("Never Ordered", "retailer", True),
                    ("Exactly 14 Days", "retailer", True),
                    ("Older Order", "retailer", True),
                    ("Recent Order", "retailer", True),
                    ("Disabled Retailer", "retailer", False),
                    ("Order Desk", "order_desk", True),
                ],
                start=1,
            )
        ]

        db.add_all(users)
        db.flush()

        ids = {user.name: user.id for user in users}

        for index, (owner, created) in enumerate(
            [
                ("Exactly 14 Days", NOW - 14 * DAY),
                ("Older Order", NOW - 19 * DAY),
                ("Recent Order", NOW - 40 * DAY),
                ("Recent Order", NOW - 13 * DAY),
            ],
            start=1,
        ):
            db.add(
                Order(
                    retailer_id=ids[owner],
                    idempotency_key=f"activity-{index}",
                    created_at=created,
                    status="submitted",
                    subtotal_paise=100,
                    discount_paise=0,
                    total_paise=100,
                )
            )

        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    def override_desk():
        with Session(engine) as db:
            return db.get(User, ids["Order Desk"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_order_desk] = override_desk

    try:
        with TestClient(app) as client:
            yield client, ids, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_inactive_boundary_and_never_ordered(activity_env):
    client, _, _ = activity_env

    response = client.get(
        "/api/order-desk/inactive-retailers"
    )

    assert response.status_code == 200

    data = response.json()

    assert data["threshold_days"] == 14
    assert data["total_active_retailers"] == 4
    assert data["inactive_count"] == 3

    assert [
        item["name"]
        for item in data["retailers"]
    ] == [
        "Never Ordered",
        "Older Order",
        "Exactly 14 Days",
    ]

    assert [
        item["days_since_last_order"]
        for item in data["retailers"]
    ] == [
        None,
        19,
        14,
    ]

    assert response.headers["cache-control"] == "private, no-store"


def test_uses_most_recent_order(activity_env):
    client, _, _ = activity_env

    response = client.get(
        "/api/order-desk/inactive-retailers"
    )

    names = [
        item["name"]
        for item in response.json()["retailers"]
    ]

    assert "Recent Order" not in names


def test_inactive_dashboard_does_not_expose_phone_numbers(
    activity_env,
):
    client, _, _ = activity_env

    data = client.get(
        "/api/order-desk/inactive-retailers"
    ).json()

    assert all(
        "phone" not in item
        for item in data["retailers"]
    )


def test_inactive_dashboard_requires_authentication(
    activity_env,
):
    client, _, _ = activity_env

    app.dependency_overrides.pop(require_order_desk)

    assert (
        client.get(
            "/api/order-desk/inactive-retailers"
        ).status_code == 401
    )


def test_retailer_cannot_access_inactive_dashboard(
    activity_env,
):
    client, ids, engine = activity_env

    app.dependency_overrides.pop(require_order_desk)

    def override_current_user():
        with Session(engine) as db:
            return db.get(
                User,
                ids["Never Ordered"],
            )

    app.dependency_overrides[current_user] = override_current_user

    assert (
        client.get(
            "/api/order-desk/inactive-retailers"
        ).status_code == 403
    )
