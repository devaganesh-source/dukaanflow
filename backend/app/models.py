
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

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
