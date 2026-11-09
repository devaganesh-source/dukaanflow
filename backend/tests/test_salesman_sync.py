"""Salesman synchronization reuses authenticated checkout and is retry-safe."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import COOKIE_NAME, token_hash
from app.database import Base, get_db
from app.main import app
from app.models import (
    Order,
    Product,
    RetailerPrice,
    SalesmanRetailer,
    User,
    UserSession,
)

URL = "/api/salesman/sync"
DRAFT_ID = "397b8aa8-75da-461d-a03d-ed70f60c7a1f"


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        users = [
            User(phone="9000000801", name="Assigned", role="retailer"),
            User(phone="9000000802", name="Other", role="retailer"),
            User(phone="9000000803", name="Salesman", role="salesman"),
            User(phone="9000000804", name="Desk", role="order_desk"),
        ]
        db.add_all(users)
        db.flush()
        assigned, other, salesman, desk = users
        ids = {"assigned": assigned.id, "other": other.id, "salesman": salesman.id}
        db.add(SalesmanRetailer(salesman_id=salesman.id, retailer_id=assigned.id))
        db.add_all([
            Product(
                sku="SKU-BS-075", name="Biscuit", category="Snacks",
                pack="75g", price_paise=9000, stock_cases=30,
                scheme="Buy 10 Get 1",
            ),
            Product(
                sku="SKU-DT-1KG", name="Detergent", category="Home",
                pack="1kg", price_paise=40000, stock_cases=10,
                scheme="3% on 5",
            ),
        ])
        db.flush()
        db.add_all([
            RetailerPrice(retailer_id=assigned.id, product_sku="SKU-BS-075", price_paise=7000),
            RetailerPrice(retailer_id=assigned.id, product_sku="SKU-DT-1KG", price_paise=35000),
            RetailerPrice(retailer_id=other.id, product_sku="SKU-BS-075", price_paise=6000),
        ])
        tokens = {}
        for user in [salesman, assigned, desk]:
            token = "test-salesman-sync-" + user.role
            tokens[user.role] = token
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
            yield client, engine, ids, tokens
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def headers(token):
    return {"Cookie": f"{COOKIE_NAME}={token}"}


def payload(retailer_id, *, draft_id=DRAFT_ID, quantity=10, items=None):
    return {
        "retailer_id": retailer_id,
        "draft_id": draft_id,
        "items": items if items is not None else [
            {"sku": "SKU-BS-075", "quantity_cases": quantity}
        ],
    }


def get_stock(engine, sku="SKU-BS-075"):
    with Session(engine) as db:
        return db.get(Product, sku).stock_cases


def test_sync_uses_live_price_and_free_goods_and_holds(env):
    client, engine, ids, tokens = env
    response = client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    assert response.status_code == 201
    body = response.json()
    assert body["retailer_id"] == ids["assigned"]
    assert body["status"] == "on_hold"
    assert body["items"][0]["unit_price_paise"] == 7000
    assert body["items"][0]["free_cases"] == 1
    assert body["total_paise"] == 70000
    assert get_stock(engine) == 19
    assert response.headers["cache-control"] == "private, no-store"


def test_retry_returns_same_order_and_reserves_once(env):
    client, engine, ids, tokens = env
    request = payload(ids["assigned"])
    first = client.post(URL, json=request, headers=headers(tokens["salesman"]))
    second = client.post(URL, json=request, headers=headers(tokens["salesman"]))
    assert (first.status_code, second.status_code) == (201, 200)
    assert first.json()["id"] == second.json()["id"]
    assert get_stock(engine) == 19
    with Session(engine) as db:
        assert db.scalar(select(func.count(Order.id))) == 1


def test_changed_draft_same_uuid_is_conflict(env):
    client, engine, ids, tokens = env
    client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    changed = client.post(URL, json=payload(ids["assigned"], quantity=11), headers=headers(tokens["salesman"]))
    assert changed.status_code == 409
    assert get_stock(engine) == 19


def test_unassigned_shop_rejected_without_stock_change(env):
    client, engine, ids, tokens = env
    response = client.post(URL, json=payload(ids["other"]), headers=headers(tokens["salesman"]))
    assert response.status_code == 404
    assert get_stock(engine) == 30


def test_disabled_assigned_shop_rejected(env):
    client, engine, ids, tokens = env
    with Session(engine) as db:
        db.get(User, ids["assigned"]).is_active = False
        db.commit()
    response = client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    assert response.status_code == 404


def test_revoked_assignment_rejects_retry(env):
    client, engine, ids, tokens = env
    first = client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    assert first.status_code == 201
    with Session(engine) as db:
        pair = db.get(SalesmanRetailer, (ids["salesman"], ids["assigned"]))
        db.delete(pair)
        db.commit()
    retry = client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    assert retry.status_code == 404
    assert get_stock(engine) == 19


def test_insufficient_stock_rolls_back_every_line(env):
    client, engine, ids, tokens = env
    request = payload(ids["assigned"], items=[
        {"sku": "SKU-BS-075", "quantity_cases": 10},
        {"sku": "SKU-DT-1KG", "quantity_cases": 11},
    ])
    response = client.post(URL, json=request, headers=headers(tokens["salesman"]))
    assert response.status_code == 409
    assert get_stock(engine) == 30
    with Session(engine) as db:
        assert db.scalar(select(func.count(Order.id))) == 0


def test_server_uses_updated_price_not_snapshot(env):
    client, engine, ids, tokens = env
    with Session(engine) as db:
        db.get(RetailerPrice, (ids["assigned"], "SKU-BS-075")).price_paise = 8200
        db.commit()
    response = client.post(URL, json=payload(ids["assigned"], quantity=2), headers=headers(tokens["salesman"]))
    assert response.status_code == 201
    assert response.json()["items"][0]["unit_price_paise"] == 8200


@pytest.mark.parametrize("bad", [
    {"retailer_id": 1, "draft_id": "bad-id", "items": [{"sku": "SKU-BS-075", "quantity_cases": 2}]},
    {"retailer_id": 1, "draft_id": DRAFT_ID, "items": []},
    {"retailer_id": 1, "draft_id": DRAFT_ID, "items": [{"sku": "SKU-BS-075", "quantity_cases": -1}]},
    {"retailer_id": 1, "draft_id": DRAFT_ID, "items": [{"sku": "SKU-BS-075", "quantity_cases": 2, "price_paise": 1}]},
    {"retailer_id": 1, "draft_id": DRAFT_ID, "items": [{"sku": "SKU-BS-075", "quantity_cases": 2}], "status": "submitted"},
])
def test_rejects_invalid_or_client_authored_prices(env, bad):
    client, engine, ids, tokens = env
    response = client.post(URL, json=bad, headers=headers(tokens["salesman"]))
    assert response.status_code == 422
    assert get_stock(engine) == 30


def test_duplicate_product_rejected(env):
    client, engine, ids, tokens = env
    request = payload(ids["assigned"], items=[
        {"sku": "SKU-BS-075", "quantity_cases": 2},
        {"sku": "SKU-BS-075", "quantity_cases": 1},
    ])
    assert client.post(URL, json=request, headers=headers(tokens["salesman"])).status_code == 422
    assert get_stock(engine) == 30


def test_non_salesman_roles_forbidden(env):
    client, engine, ids, tokens = env
    for role in ["retailer", "order_desk"]:
        assert client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens[role])).status_code == 403
    assert get_stock(engine) == 30


def test_unauthenticated_rejected(env):
    client, engine, ids, tokens = env
    assert client.post(URL, json=payload(ids["assigned"])).status_code == 401
    assert get_stock(engine) == 30


def test_on_hold_cannot_generate_loading_list(env):
    client, engine, ids, tokens = env
    response = client.post(URL, json=payload(ids["assigned"]), headers=headers(tokens["salesman"]))
    assert response.status_code == 201
    order_id = response.json()["id"]
    sheet = client.post(
        "/api/order-desk/loading-list/preview",
        json={"order_ids": [order_id]},
        headers=headers(tokens["order_desk"]),
    )
    assert sheet.status_code == 409
