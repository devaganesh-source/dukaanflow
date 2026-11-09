"""Salesman read access is limited to assigned active retailers."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import COOKIE_NAME, token_hash
from app.database import Base, get_db
from app.main import app
from app.models import (
    Product,
    RetailerPrice,
    SalesmanRetailer,
    User,
    UserSession,
)


@pytest.fixture
def salesman_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        users = [
            User(phone="9000000901", name="Assigned Shop", role="retailer"),
            User(phone="9000000902", name="Other Shop", role="retailer"),
            User(phone="9000000903", name="Disabled Shop", role="retailer", is_active=False),
            User(phone="9000000904", name="Sales Person", role="salesman"),
            User(phone="9000000905", name="Desk", role="order_desk"),
        ]
        db.add_all(users)
        db.flush()
        assigned, other, inactive, salesman, desk = users
        db.add_all([
            SalesmanRetailer(salesman_id=salesman.id, retailer_id=assigned.id),
            SalesmanRetailer(salesman_id=salesman.id, retailer_id=inactive.id),
            Product(
                sku="BIS-01", name="Biscuits", category="Snacks",
                pack="Case of 20", price_paise=6000,
                stock_cases=70, scheme="Buy 10 get 1",
            ),
        ])
        db.flush()
        db.add_all([
            RetailerPrice(
                retailer_id=assigned.id, product_sku="BIS-01", price_paise=5700,
            ),
            RetailerPrice(
                retailer_id=other.id, product_sku="BIS-01", price_paise=5500,
            ),
        ])
        ids = {
            "assigned": assigned.id,
            "other": other.id,
            "inactive": inactive.id,
        }
        tokens = {}
        for key, user in [("salesman", salesman), ("desk", desk), ("retailer", assigned)]:
            token = f"offline-{key}-test-token"
            tokens[key] = token
            db.add(UserSession(
                token_hash=token_hash(token), user_id=user.id,
                created_at=int(time.time()), expires_at=int(time.time()) + 3600,
            ))
        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app) as client:
            yield client, ids, tokens
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def auth(token):
    return {"Cookie": f"{COOKIE_NAME}={token}"}


def test_assigned_shops_only_and_no_phone(salesman_env):
    client, ids, tokens = salesman_env
    response = client.get(
        "/api/salesman/retailers", headers=auth(tokens["salesman"])
    )
    assert response.status_code == 200
    assert response.json()["shops"] == [
        {"id": ids["assigned"], "name": "Assigned Shop"}
    ]
    assert "phone" not in response.text
    assert response.headers["cache-control"] == "private, no-store"


def test_assigned_catalogue_uses_shops_price(salesman_env):
    client, ids, tokens = salesman_env
    response = client.get(
        f"/api/salesman/retailers/{ids['assigned']}/catalogue",
        headers=auth(tokens["salesman"]),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["snapshot_only"] is True
    assert data["retailer"]["name"] == "Assigned Shop"
    assert data["products"][0]["price_paise"] == 5700
    assert data["products"][0]["stock_cases"] == 70
    assert data["products"][0]["scheme"] == "Buy 10 get 1"
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("retailer_key", ["other", "inactive"])
def test_unassigned_or_disabled_shop_is_not_accessible(salesman_env, retailer_key):
    client, ids, tokens = salesman_env
    response = client.get(
        f"/api/salesman/retailers/{ids[retailer_key]}/catalogue",
        headers=auth(tokens["salesman"]),
    )
    assert response.status_code == 404


@pytest.mark.parametrize("token_key", ["desk", "retailer"])
def test_other_roles_cannot_use_salesman_mode(salesman_env, token_key):
    client, _, tokens = salesman_env
    assert client.get(
        "/api/salesman/retailers", headers=auth(tokens[token_key])
    ).status_code == 403


def test_guest_cannot_use_salesman_mode(salesman_env):
    client, _, _ = salesman_env
    assert client.get("/api/salesman/retailers").status_code == 401


def test_salesman_cannot_use_retailer_or_desk_endpoints(salesman_env):
    client, _, tokens = salesman_env
    header = auth(tokens["salesman"])
    assert client.get("/api/products", headers=header).status_code == 403
    assert client.get("/api/order-desk/retailers", headers=header).status_code == 403


def test_salesman_session_role(salesman_env):
    client, _, tokens = salesman_env
    response = client.get("/api/auth/me", headers=auth(tokens["salesman"]))
    assert response.status_code == 200
    assert response.json()["role"] == "salesman"
