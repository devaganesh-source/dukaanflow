
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import current_user, require_retailer
from app.database import Base, get_db
from app.main import app
from app.models import Order, User


@pytest.fixture
def history_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        retailer_one = User(
            phone="9000000041",
            name="Shop One",
            role="retailer",
            is_active=True,
        )
        retailer_two = User(
            phone="9000000042",
            name="Shop Two",
            role="retailer",
            is_active=True,
        )
        desk = User(
            phone="9000000043",
            name="Desk",
            role="order_desk",
            is_active=True,
        )

        db.add_all([retailer_one, retailer_two, desk])
        db.flush()

        ids = (
            retailer_one.id,
            retailer_two.id,
            desk.id,
        )

        for index, (owner, stamp) in enumerate(
            [
                (ids[0], 100),
                (ids[1], 500),
                (ids[0], 200),
            ],
            start=1,
        ):
            db.add(
                Order(
                    retailer_id=owner,
                    idempotency_key=f"history-{index}",
                    status="submitted",
                    created_at=stamp,
                    subtotal_paise=1000,
                    discount_paise=0,
                    total_paise=1000,
                )
            )

        db.commit()

    active = {"id": ids[0]}

    def override_db():
        with Session(engine) as db:
            yield db

    def override_retailer():
        with Session(engine) as db:
            return db.get(User, active["id"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_retailer] = override_retailer

    try:
        with TestClient(app) as client:
            yield client, active, ids
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_history_is_retailer_scoped_and_newest_first(history_env):
    client, _, _ = history_env

    response = client.get("/api/orders")

    assert response.status_code == 200
    assert [
        row["created_at"]
        for row in response.json()["orders"]
    ] == [200, 100]

    assert response.json()["total"] == 2
    assert response.headers["cache-control"] == "private, no-store"


def test_history_pagination(history_env):
    client, _, _ = history_env

    response = client.get(
        "/api/orders?page=2&page_size=1"
    )

    assert response.status_code == 200
    assert response.json()["orders"][0]["created_at"] == 100
    assert response.json()["total"] == 2


def test_another_retailer_only_sees_their_orders(history_env):
    client, active, ids = history_env
    active["id"] = ids[1]

    response = client.get("/api/orders")

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["orders"][0]["created_at"] == 500


def test_history_validates_pagination(history_env):
    client, _, _ = history_env

    assert client.get("/api/orders?page=0").status_code == 422
    assert client.get("/api/orders?page_size=51").status_code == 422


def test_history_rejects_unauthenticated_user(history_env):
    client, _, _ = history_env

    app.dependency_overrides.pop(require_retailer)

    assert client.get("/api/orders").status_code == 401


def test_order_desk_cannot_read_retailer_history(history_env):
    client, _, ids = history_env

    app.dependency_overrides.pop(require_retailer)

    def override_current_user():
        return User(
            id=ids[2],
            phone="9000000043",
            name="Desk",
            role="order_desk",
            is_active=True,
        )

    app.dependency_overrides[current_user] = override_current_user

    assert client.get("/api/orders").status_code == 403
