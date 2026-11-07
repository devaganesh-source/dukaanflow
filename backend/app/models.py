
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Text,

)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        CheckConstraint("price_paise > 0"),
        CheckConstraint("stock_cases >= 0"),
    )

    sku: Mapped[str] = mapped_column(
        String(40), primary_key=True
    )
    name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(60))
    pack: Mapped[str] = mapped_column(String(80))
    price_paise: Mapped[int] = mapped_column(Integer)
    stock_cases: Mapped[int] = mapped_column(Integer)
    scheme: Mapped[str | None] = mapped_column(
        String(160), nullable=True
    )


class User(Base):
    __tablename__ = "users"

    __table_args__ = (
        CheckConstraint(
            "role IN ('retailer', 'order_desk')",
            name="valid_user_role",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(
        String(15), unique=True, index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True
    )


class OTPChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
        index=True,
    )
    otp_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[int] = mapped_column(Integer)
    failed_attempts: Mapped[int] = mapped_column(
        Integer, default=0
    )
    locked_until: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    last_sent_at: Mapped[int] = mapped_column(Integer)


class UserSession(Base):
    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(
        String(64), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True
    )
    created_at: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[int] = mapped_column(Integer)



class RetailerPrice(Base):
    __tablename__ = "retailer_prices"

    __table_args__ = (
        CheckConstraint(
            "price_paise > 0",
            name="valid_retailer_price",
        ),
    )

    retailer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        primary_key=True,
    )

    product_sku: Mapped[str] = mapped_column(
        ForeignKey("products.sku"),
        primary_key=True,
    )

    price_paise: Mapped[int] = mapped_column(Integer)

class Order(Base):
    __tablename__ = "orders"

    __table_args__ = (
        UniqueConstraint(
            "retailer_id",
            "idempotency_key",
            name="uq_order_retailer_request",
        ),
        CheckConstraint(
            "status IN ('submitted', 'on_hold', 'exported')",
            name="valid_order_status",
        ),
        CheckConstraint(
            "subtotal_paise >= 0",
            name="order_subtotal_nonnegative",
        ),
        CheckConstraint(
            "discount_paise >= 0",
            name="order_discount_nonnegative",
        ),
        CheckConstraint(
            "total_paise = subtotal_paise - discount_paise",
            name="order_total_matches",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    retailer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        index=True,
    )

    idempotency_key: Mapped[str] = mapped_column(
        String(80),
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="submitted",
    )

    created_at: Mapped[int] = mapped_column(Integer)

    subtotal_paise: Mapped[int] = mapped_column(Integer)
    discount_paise: Mapped[int] = mapped_column(Integer)
    total_paise: Mapped[int] = mapped_column(Integer)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
    )

class OrderItem(Base):
    __tablename__ = "order_items"

    __table_args__ = (
        UniqueConstraint(
            "order_id",
            "product_sku",
            name="uq_order_item_sku",
        ),
        CheckConstraint(
            "paid_cases > 0",
            name="order_item_positive_quantity",
        ),
        CheckConstraint(
            "free_cases >= 0",
            name="order_item_nonnegative_free",
        ),
        CheckConstraint(
            "total_cases = paid_cases + free_cases",
            name="order_item_case_total",
        ),
        CheckConstraint(
            "unit_price_paise > 0",
            name="order_item_positive_price",
        ),
        CheckConstraint(
            "subtotal_paise = paid_cases * unit_price_paise",
            name="order_item_subtotal_matches",
        ),
        CheckConstraint(
            "discount_paise >= 0 AND discount_paise <= subtotal_paise",
            name="order_item_valid_discount",
        ),
        CheckConstraint(
            "total_paise = subtotal_paise - discount_paise",
            name="order_item_total_matches",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id"),
    )

    product_sku: Mapped[str] = mapped_column(String(40))
    product_name: Mapped[str] = mapped_column(String(150))
    pack: Mapped[str] = mapped_column(String(80))

    paid_cases: Mapped[int] = mapped_column(Integer)
    free_cases: Mapped[int] = mapped_column(Integer)
    total_cases: Mapped[int] = mapped_column(Integer)

    unit_price_paise: Mapped[int] = mapped_column(Integer)
    subtotal_paise: Mapped[int] = mapped_column(Integer)
    discount_paise: Mapped[int] = mapped_column(Integer)
    total_paise: Mapped[int] = mapped_column(Integer)

    order: Mapped["Order"] = relationship(
        back_populates="items",
    )

class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"

    __table_args__ = (
        CheckConstraint(
            "old_status IN ('submitted', 'on_hold')",
            name="valid_previous_order_status",
        ),
        CheckConstraint(
            "new_status IN ('submitted', 'on_hold', 'exported')",
            name="valid_next_order_status",
        ),
        CheckConstraint(
            "old_status != new_status",
            name="order_status_must_change",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id"),
        index=True,
        nullable=False,
    )

    actor_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    old_status: Mapped[str] = mapped_column(String(20))
    new_status: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(300))
    changed_at: Mapped[int] = mapped_column(Integer)


class OrderExport(Base):
    __tablename__ = "order_exports"

    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id"),
        primary_key=True,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    created_at: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    xml_payload: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
