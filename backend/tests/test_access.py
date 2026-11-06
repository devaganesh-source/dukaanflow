
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import COOKIE_NAME, token_hash
from app.catalog import PRODUCTS
from app.database import Base, get_db
from app.main import app
from app.models import (
    Product,
    RetailerPrice,
    User,
    UserSession,
)


@pytest.fixture
def access_client():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(test_engine)

    tokens = {
        "first": "test-retailer-one-token",
        "second": "test-retailer-two-token",
        "desk": "test-order-desk-token",
    }

    now = int(time.time())

    with Session(test_engine) as db:
        first = User(
            phone="9000000001",
            name="Retailer One",
            role="retailer",
        )
        second = User(
            phone="9000000003",
            name="Retailer Two",
            role="retailer",
        )
        desk = User(
            phone="9000000002",
            name="Order Desk",
            role="order_desk",
        )

        db.add_all([first, second, desk])
        db.flush()

        ids = {
            "first": first.id,
            "second": second.id,
            "desk": desk.id,
        }

        db.add_all(Product(**item) for item in PRODUCTS)
        db.flush()

        for item in PRODUCTS:
            db.add(
                RetailerPrice(
                    retailer_id=first.id,
                    product_sku=item["sku"],
                    price_paise=(
                        76500
                        if item["sku"] == "SKU-BS-075"
                        else item["price_paise"]
                    ),
                )
            )

        db.add(
            RetailerPrice(
                retailer_id=second.id,
                product_sku="SKU-BS-075",
                price_paise=74000,
            )
        )

        for key, user_id in ids.items():
            db.add(
                UserSession(
                    token_hash=token_hash(tokens[key]),
                    user_id=user_id,
                    created_at=now,
                    expires_at=now + 3600,
                )
            )

        db.commit()

    def override_get_db():
        with Session(test_engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db

    try:
        yield TestClient(app), ids, tokens
    finally:
        app.dependency_overrides.clear()
        test_engine.dispose()


def auth_header(token):
    return {"Cookie": f"{COOKIE_NAME}={token}"}


def test_protected_endpoints_require_login(access_client):
    client, ids, _ = access_client

    paths = [
        "/api/products",
        "/api/order-desk/retailers",
        f"/api/order-desk/retailers/{ids['first']}/products",
    ]

    for path in paths:
        assert client.get(path).status_code == 401


def test_retailers_only_see_their_own_prices(access_client):
    client, ids, tokens = access_client

    first_response = client.get(
        "/api/products",
        headers=auth_header(tokens["first"]),
    )

    assert first_response.status_code == 200

    first_products = first_response.json()["products"]
    assert len(first_products) == 6

    biscuit = next(
        p for p in first_products
        if p["sku"] == "SKU-BS-075"
    )
    assert biscuit["price_paise"] == 76500

    second_response = client.get(
        "/api/products",
        headers=auth_header(tokens["second"]),
    )

    assert second_response.status_code == 200

    second_products = second_response.json()["products"]
    assert len(second_products) == 1
    assert second_products[0]["price_paise"] == 74000

    forbidden = client.get(
        f"/api/order-desk/retailers/{ids['second']}/products",
        headers=auth_header(tokens["first"]),
    )

    assert forbidden.status_code == 403


def test_order_desk_permissions(access_client):
    client, ids, tokens = access_client
    headers = auth_header(tokens["desk"])

    # Order desk cannot use the retailer-only endpoint.
    assert client.get(
        "/api/products",
        headers=headers,
    ).status_code == 403

    retailers = client.get(
        "/api/order-desk/retailers",
        headers=headers,
    )

    assert retailers.status_code == 200
    assert len(retailers.json()["retailers"]) == 2

    catalogue = client.get(
        f"/api/order-desk/retailers/{ids['second']}/products",
        headers=headers,
    )

    assert catalogue.status_code == 200
    assert catalogue.json()["products"][0]["price_paise"] == 74000

    missing = client.get(
        "/api/order-desk/retailers/999999/products",
        headers=headers,
    )

    assert missing.status_code == 404
