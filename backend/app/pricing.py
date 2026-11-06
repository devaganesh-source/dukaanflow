
from dataclasses import dataclass
from typing import Literal


class PricingError(ValueError):
    pass


@dataclass(frozen=True)
class SchemeRule:
    kind: Literal["buy_get", "percent_off"]
    minimum_cases: int
    free_cases: int = 0
    discount_bps: int = 0


# 100 basis points = 1%
# These are initial demo rules. We will connect
# structured scheme records to checkout later.
SCHEME_RULES: dict[str, SchemeRule] = {
    "SKU-BS-075": SchemeRule(
        kind="buy_get",
        minimum_cases=10,
        free_cases=1,
    ),
    "SKU-DT-1KG": SchemeRule(
        kind="percent_off",
        minimum_cases=5,
        discount_bps=300,
    ),
    "SOAP-100": SchemeRule(
        kind="percent_off",
        minimum_cases=10,
        discount_bps=200,
    ),
}


@dataclass(frozen=True)
class LineQuote:
    sku: str
    paid_cases: int
    free_cases: int
    total_cases: int
    unit_price_paise: int
    subtotal_paise: int
    discount_paise: int
    total_paise: int
    scheme_applied: bool


def calculate_line(
    *,
    sku: str,
    quantity_cases: int,
    unit_price_paise: int,
    stock_cases: int,
) -> LineQuote:
    if not isinstance(sku, str) or not sku.strip():
        raise PricingError("Invalid product SKU")

    if type(quantity_cases) is not int or quantity_cases <= 0:
        raise PricingError(
            "Quantity must be a positive whole number"
        )

    if type(unit_price_paise) is not int or unit_price_paise <= 0:
        raise PricingError("Invalid product price")

    if type(stock_cases) is not int or stock_cases < 0:
        raise PricingError("Invalid available stock")

    rule = SCHEME_RULES.get(sku)

    free_cases = 0
    discount_paise = 0
    subtotal_paise = quantity_cases * unit_price_paise
    scheme_applied = False

    if rule is not None and quantity_cases >= rule.minimum_cases:
        scheme_applied = True

        if rule.kind == "buy_get":
            free_cases = (
                quantity_cases // rule.minimum_cases
            ) * rule.free_cases

        elif rule.kind == "percent_off":
            # Round to the nearest paise, half up.
            discount_paise = (
                subtotal_paise * rule.discount_bps + 5000
            ) // 10000

    total_cases = quantity_cases + free_cases

    if total_cases > stock_cases:
        raise PricingError(
            f"Insufficient stock for {sku}. "
            f"Required: {total_cases} cases; "
            f"available: {stock_cases} cases"
        )

    total_paise = subtotal_paise - discount_paise

    return LineQuote(
        sku=sku,
        paid_cases=quantity_cases,
        free_cases=free_cases,
        total_cases=total_cases,
        unit_price_paise=unit_price_paise,
        subtotal_paise=subtotal_paise,
        discount_paise=discount_paise,
        total_paise=total_paise,
        scheme_applied=scheme_applied,
    )
