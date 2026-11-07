
import xml.etree.ElementTree as ET

import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_order_desk
from app.database import Base, get_db
from app.main import app
from app.models import (
    Order,
    OrderExport,
    OrderItem,
    OrderStatusEvent,
    User,
)


@pytest.fixture
def export_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        retailer = User(
            phone="9000000031",
            name="Retailer & Sons",
            role="retailer",
            is_active=True,
        )

        desk = User(
            phone="9000000032",
            name="Export Staff",
            role="order_desk",
            is_active=True,
        )

        db.add_all([retailer, desk])
        db.flush()

        desk_id = desk.id

        order = Order(
            retailer_id=retailer.id,
            idempotency_key="tally-export-test",
            status="submitted",
            created_at=1794000000,
            subtotal_paise=1780000,
            discount_paise=30450,
            total_paise=1749550,
            items=[
                OrderItem(
                    product_sku="SKU-BS-075",
                    product_name="Glucose Biscuit",
                    pack="Case of 96",
                    paid_cases=10,
                    free_cases=1,
                    total_cases=11,
                    unit_price_paise=76500,
                    subtotal_paise=765000,
                    discount_paise=0,
                    total_paise=765000,
                ),
                OrderItem(
                    product_sku="SKU-DT-1KG",
                    product_name="Detergent",
                    pack="Case of 20",
                    paid_cases=5,
                    free_cases=0,
                    total_cases=5,
                    unit_price_paise=203000,
                    subtotal_paise=1015000,
                    discount_paise=30450,
                    total_paise=984550,
                ),
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


def export_url(order_id):
    return f"/api/order-desk/orders/{order_id}/export"


def test_export_creates_xml_and_audit(export_env):
    client, engine, order_id = export_env

    response = client.post(export_url(order_id))

    assert response.status_code == 200
    assert "application/xml" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]

    root = ET.fromstring(response.content)

    assert root.findtext(
        "./HEADER/TALLYREQUEST"
    ) == "Import"

    assert root.findtext(
        ".//VOUCHERTYPENAME"
    ) == "Sales Order"

    assert root.findtext(
        ".//PARTYLEDGERNAME"
    ) == "Retailer & Sons"

    assert root.findtext(
        ".//VOUCHERNUMBER"
    ) == f"DF-{order_id}"

    with Session(engine) as db:
        assert db.get(Order, order_id).status == "exported"
        assert db.get(OrderExport, order_id) is not None

        event = db.scalar(select(OrderStatusEvent))
        assert event.old_status == "submitted"
        assert event.new_status == "exported"
        assert event.reason == "Tally Sales Order XML generated"


def test_export_preserves_free_cases(export_env):
    client, _, order_id = export_env

    response = client.post(export_url(order_id))
    assert response.status_code == 200

    root = ET.fromstring(response.content)

    biscuit = next(
        entry
        for entry in root.findall(
            ".//ALLINVENTORYENTRIES.LIST"
        )
        if entry.findtext("STOCKITEMNAME") == "SKU-BS-075"
    )

    assert biscuit.findtext("ACTUALQTY").strip() == "11 CASE"
    assert biscuit.findtext("BILLEDQTY").strip() == "10 CASE"
    assert biscuit.findtext("RATE") == "765.00/CASE"
    assert biscuit.findtext("AMOUNT") == "7650.00"


def test_export_preserves_discount_and_balances(export_env):
    client, _, order_id = export_env

    root = ET.fromstring(
        client.post(export_url(order_id)).content
    )

    assert root.findtext(
        ".//PARTYLEDGERNAME"
    ) == "Retailer & Sons"

    ledgers = root.findall(".//LEDGERENTRIES.LIST")

    values = {
        entry.findtext("LEDGERNAME"):
        entry.findtext("AMOUNT")
        for entry in ledgers
    }

    assert values["Retailer & Sons"] == "-17495.50"
    assert values["Scheme Discounts"] == "-304.50"

    from decimal import Decimal

    inventory = root.findall(
        ".//ALLINVENTORYENTRIES.LIST"
    )

    credits = sum(
        Decimal(entry.findtext("AMOUNT"))
        for entry in inventory
    )

    debits = sum(
        Decimal(entry.findtext("AMOUNT"))
        for entry in ledgers
    )

    assert credits + debits == 0


def test_repeated_export_returns_same_file(export_env):
    client, engine, order_id = export_env

    first = client.post(export_url(order_id))
    second = client.post(export_url(order_id))

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content == second.content

    with Session(engine) as db:
        assert db.scalar(
            select(func.count(OrderExport.order_id))
        ) == 1
        assert db.scalar(
            select(func.count(OrderStatusEvent.id))
        ) == 1


def test_on_hold_order_cannot_export(export_env):
    client, engine, order_id = export_env

    with Session(engine) as db:
        db.get(Order, order_id).status = "on_hold"
        db.commit()

    response = client.post(export_url(order_id))

    assert response.status_code == 409

    with Session(engine) as db:
        assert db.get(Order, order_id).status == "on_hold"
        assert db.get(OrderExport, order_id) is None


def test_missing_order_returns_404(export_env):
    client, _, _ = export_env

    response = client.post(export_url(99999))
    assert response.status_code == 404


def test_export_requires_login(export_env):
    client, _, order_id = export_env

    app.dependency_overrides.pop(require_order_desk)

    response = client.post(export_url(order_id))
    assert response.status_code == 401


def test_exported_order_without_file_is_rejected(export_env):
    client, engine, order_id = export_env

    with Session(engine) as db:
        db.get(Order, order_id).status = "exported"
        db.commit()

    response = client.post(export_url(order_id))
    assert response.status_code == 409
