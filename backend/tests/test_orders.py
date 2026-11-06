
import time

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Order, OrderItem, User


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add_all([
            User(
                phone="9000000001",
                name="Retailer One",
                role="retailer",
            ),
            User(
                phone="9000000003",
                name="Retailer Two",
                role="retailer",
            ),
        ])
        session.commit()

        yield session

    engine.dispose()


def make_order(retailer_id=1, key="test-request-001"):
    return Order(
        retailer_id=retailer_id,
        idempotency_key=key,
        status="submitted",
        created_at=int(time.time()),
        subtotal_paise=765000,
        discount_paise=0,
        total_paise=765000,
        items=[
            OrderItem(
                product_sku="SKU-BS-075",
                product_name="Glucose Biscuit 75g",
                pack="Case of 96 packs",
                paid_cases=10,
                free_cases=1,
                total_cases=11,
                unit_price_paise=76500,
                subtotal_paise=765000,
                discount_paise=0,
                total_paise=765000,
            )
        ],
    )


def test_order_is_saved_with_items(db):
    order = make_order()

    db.add(order)
    db.commit()

    order_id = order.id
    db.expunge_all()

    saved = db.get(Order, order_id)

    assert saved is not None
    assert saved.status == "submitted"
    assert saved.total_paise == 765000
    assert len(saved.items) == 1

    item = saved.items[0]

    assert item.paid_cases == 10
    assert item.free_cases == 1
    assert item.total_cases == 11
    assert item.unit_price_paise == 76500


def test_duplicate_order_request_is_rejected(db):
    db.add(make_order())
    db.commit()

    db.add(make_order())

    with pytest.raises(IntegrityError):
        db.commit()

    db.rollback()


def test_same_request_key_allowed_for_other_retailer(db):
    db.add(make_order(retailer_id=1, key="same-key"))
    db.add(make_order(retailer_id=2, key="same-key"))

    db.commit()

    orders = db.scalars(select(Order)).all()

    assert len(orders) == 2


def test_incorrect_order_total_is_rejected(db):
    order = make_order()
    order.total_paise = 999

    db.add(order)

    with pytest.raises(IntegrityError):
        db.commit()

    db.rollback()


def test_incorrect_free_case_total_is_rejected(db):
    order = make_order()
    order.items[0].total_cases = 10

    db.add(order)

    with pytest.raises(IntegrityError):
        db.commit()

    db.rollback()


def test_duplicate_sku_in_order_is_rejected(db):
    order = make_order()

    original = order.items[0]

    order.items.append(
        OrderItem(
            product_sku=original.product_sku,
            product_name=original.product_name,
            pack=original.pack,
            paid_cases=1,
            free_cases=0,
            total_cases=1,
            unit_price_paise=76500,
            subtotal_paise=76500,
            discount_paise=0,
            total_paise=76500,
        )
    )

    db.add(order)

    with pytest.raises(IntegrityError):
        db.commit()

    db.rollback()
