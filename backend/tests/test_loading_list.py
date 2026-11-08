
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import current_user, require_order_desk
from app.database import Base, get_db
from app.main import app
from app.models import Order, OrderItem, User


URL = "/api/order-desk/loading-list/preview"


@pytest.fixture
def loading_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        alpha = User(
            phone="9000000811",
            name="Alpha Shop",
            role="retailer",
            is_active=True,
        )

        beta = User(
            phone="9000000812",
            name="Beta Shop",
            role="retailer",
            is_active=True,
        )

        desk = User(
            phone="9000000813",
            name="Desk",
            role="order_desk",
            is_active=True,
        )

        db.add_all([alpha, beta, desk])
        db.flush()

        ids = {
            "alpha": alpha.id,
            "beta": beta.id,
            "desk": desk.id,
        }

        specs = [
            (
                alpha.id,
                "submitted",
                [
                    ("SKU-BS", "Biscuit", "75g", 10, 1),
                    ("SKU-TE", "Tea", "250g", 2, 0),
                ],
            ),
            (
                beta.id,
                "exported",
                [
                    ("SKU-BS", "Biscuit", "75g", 5, 0),
                ],
            ),
            (
                beta.id,
                "on_hold",
                [
                    ("SKU-BS", "Biscuit", "75g", 7, 0),
                ],
            ),
            (
                alpha.id,
                "submitted",
                [
                    ("SKU-BS", "Biscuit", "150g", 3, 0),
                ],
            ),
        ]

        for index, (
            retailer_id,
            status,
            items,
        ) in enumerate(specs, start=1):
            lines = []

            for sku, name, pack, paid, free in items:
                lines.append(
                    OrderItem(
                        product_sku=sku,
                        product_name=name,
                        pack=pack,
                        paid_cases=paid,
                        free_cases=free,
                        total_cases=paid + free,
                        unit_price_paise=100,
                        subtotal_paise=paid * 100,
                        discount_paise=0,
                        total_paise=paid * 100,
                    )
                )

            total = sum(
                line.total_paise
                for line in lines
            )

            db.add(
                Order(
                    retailer_id=retailer_id,
                    idempotency_key=f"load-{index}",
                    status=status,
                    created_at=index,
                    subtotal_paise=total,
                    discount_paise=0,
                    total_paise=total,
                    items=lines,
                )
            )

        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    def override_desk():
        with Session(engine) as db:
            return db.get(User, ids["desk"])

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_order_desk] = (
        override_desk
    )

    try:
        with TestClient(app) as client:
            yield client, engine, ids
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_aggregates_paid_free_and_per_shop_details(
    loading_env,
):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={"order_ids": [1, 2]},
    )

    assert response.status_code == 200

    data = response.json()

    assert data["order_count"] == 2
    assert data["retailer_count"] == 2
    assert data["paid_cases"] == 17
    assert data["free_cases"] == 1
    assert data["total_cases"] == 18

    assert data["lines"] == [
        {
            "product_sku": "SKU-BS",
            "product_name": "Biscuit",
            "pack": "75g",
            "paid_cases": 15,
            "free_cases": 1,
            "total_cases": 16,
        },
        {
            "product_sku": "SKU-TE",
            "product_name": "Tea",
            "pack": "250g",
            "paid_cases": 2,
            "free_cases": 0,
            "total_cases": 2,
        },
    ]

    assert [
        order["retailer_name"]
        for order in data["orders"]
    ] == ["Alpha Shop", "Beta Shop"]

    assert (
        data["orders"][0]["items"][0]["free_cases"]
        == 1
    )

    assert (
        response.headers["cache-control"]
        == "private, no-store"
    )


def test_keeps_different_pack_sizes_separate(
    loading_env,
):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={"order_ids": [1, 4]},
    )

    assert response.status_code == 200

    biscuit = [
        line
        for line in response.json()["lines"]
        if line["product_sku"] == "SKU-BS"
    ]

    assert {
        (line["pack"], line["total_cases"])
        for line in biscuit
    } == {
        ("75g", 11),
        ("150g", 3),
    }

    assert response.json()["retailer_count"] == 1


def test_rejects_on_hold_without_partial_list(
    loading_env,
):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={"order_ids": [1, 3]},
    )

    assert response.status_code == 409
    assert "on-hold" in response.json()["detail"]


def test_missing_order_is_not_silently_skipped(
    loading_env,
):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={"order_ids": [1, 98765]},
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    "ids",
    [
        [],
        [1, 1],
        [0],
        [-1],
        [True],
        ["1"],
        list(range(1, 52)),
    ],
)
def test_rejects_bad_selections(loading_env, ids):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={"order_ids": ids},
    )

    assert response.status_code == 422


def test_rejects_unknown_fields(loading_env):
    client, _, _ = loading_env

    response = client.post(
        URL,
        json={
            "order_ids": [1],
            "delete_after": True,
        },
    )

    assert response.status_code == 422


def test_preview_is_read_only(loading_env):
    client, engine, _ = loading_env

    with Session(engine) as db:
        before = [
            (order.id, order.status)
            for order in db.scalars(
                select(Order).order_by(Order.id)
            ).all()
        ]

    response = client.post(
        URL,
        json={"order_ids": [1, 2]},
    )

    assert response.status_code == 200

    with Session(engine) as db:
        after = [
            (order.id, order.status)
            for order in db.scalars(
                select(Order).order_by(Order.id)
            ).all()
        ]

    assert before == after


def test_authentication_required(loading_env):
    client, _, _ = loading_env

    app.dependency_overrides.pop(
        require_order_desk
    )

    response = client.post(
        URL,
        json={"order_ids": [1]},
    )

    assert response.status_code == 401


def test_retailer_forbidden(loading_env):
    client, engine, ids = loading_env

    app.dependency_overrides.pop(
        require_order_desk
    )

    def override_current_user():
        with Session(engine) as db:
            return db.get(
                User,
                ids["alpha"],
            )

    app.dependency_overrides[current_user] = (
        override_current_user
    )

    response = client.post(
        URL,
        json={"order_ids": [1]},
    )

    assert response.status_code == 403
