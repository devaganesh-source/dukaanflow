
from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        CheckConstraint("price_paise > 0"),
        CheckConstraint("stock_cases >= 0"),
    )

    sku: Mapped[str] = mapped_column(
        String(40),
        primary_key=True,
    )

    name: Mapped[str] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(60))
    pack: Mapped[str] = mapped_column(String(80))

    price_paise: Mapped[int] = mapped_column(Integer)
    stock_cases: Mapped[int] = mapped_column(Integer)

    scheme: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )
