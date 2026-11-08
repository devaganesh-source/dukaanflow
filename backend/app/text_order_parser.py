
import re
import unicodedata
from difflib import SequenceMatcher
from typing import Sequence

from pydantic import BaseModel

from .models import Product


MAX_LINES = 15
MAX_CASES = 999

CASE_UNITS = r"cases?|peti(?:yan)?|cartons?|crates?"
OTHER_UNITS = r"pieces?|pcs?|packets?|packs?|boxes?|bottles?"
ALL_UNITS = rf"(?:{CASE_UNITS}|{OTHER_UNITS})"

SPLIT_LINES = re.compile(
    r"\s*(?:[,;\n]+|\b(?:aur|and|plus)\b)\s*",
    re.IGNORECASE,
)

PREFIX_UNIT = re.compile(
    rf"^(?P<qty>\d+)\s*(?P<unit>{ALL_UNITS})\b\s+(?P<product>.+)$",
    re.IGNORECASE,
)

MIDDLE_UNIT = re.compile(
    rf"^(?P<qty>\d+)\s+(?P<product>.+?)\s+(?P<unit>{ALL_UNITS})$",
    re.IGNORECASE,
)

SUFFIX_UNIT = re.compile(
    rf"^(?P<product>.+?)\s+(?P<qty>\d+)\s*(?P<unit>{ALL_UNITS})$",
    re.IGNORECASE,
)

EXPLICIT_QUANTITY = re.compile(
    rf"\b\d+\s*{ALL_UNITS}\b",
    re.IGNORECASE,
)

LEADING_QUANTITY = re.compile(
    r"^(?P<qty>\d+)\s+(?P<product>.+)$"
)


class ProductCandidate(BaseModel):
    sku: str
    name: str
    pack: str
    stock_cases: int
    match_score: int


class ParsedLine(BaseModel):
    original_text: str
    product_text: str
    quantity_cases: int | None
    status: str
    issue: str | None
    message: str | None
    selected_sku: str | None
    candidates: list[ProductCandidate]


class ParsedOrder(BaseModel):
    lines: list[ParsedLine]
    has_unresolved_lines: bool
    confirmation_required: bool = True


MESSAGES = {
    "missing_quantity": "Specify a quantity in cases.",
    "unit_required": "Confirm the unit as cases or peti.",
    "unsupported_unit": (
        "Only case quantities are supported. "
        "Do not convert pieces or packets into cases."
    ),
    "invalid_quantity": (
        "Quantity must be between 1 and 999 cases."
    ),
    "multiple_quantities": (
        "Multiple quantities found in one line. "
        "Please separate the products."
    ),
    "no_product_match": (
        "No matching catalogue product found."
    ),
    "ambiguous_product": (
        "Select the correct product from the suggestions."
    ),
    "insufficient_stock": (
        "Requested quantity exceeds available stock."
    ),
}


def normalize(value: str) -> str:
    """Normalize common English and Hinglish product terms."""
    text = unicodedata.normalize(
        "NFKC", value
    ).casefold()

    substitutions = (
        (r"\bchai\s+patti\b", "tea"),
        (r"\bwashing\s+powder\b", "detergent"),
        (r"\bbiscuits\b", "biscuit"),
        (r"\bsoaps\b", "soap"),
        (r"\bchh?ota\b", "small"),
        (r"\bchh?oti\b", "small"),
        (r"\bkilos?\b", "kg"),
        (r"\bkilograms?\b", "kg"),
        (r"\bgrams?\b", "g"),
        (r"\bgms?\b", "g"),
        (r"\b(\d+)\s*kg\b", r"\1kg"),
        (r"\b(\d+)\s*g\b", r"\1g"),
        (
            r"\b(?:bhaiya|please|mujhe|chahiye|"
            r"wala|wali|dena)\b",
            " ",
        ),
    )

    for pattern, replacement in substitutions:
        text = re.sub(pattern, replacement, text)

    return " ".join(
        re.findall(r"[a-z0-9]+", text)
    )


def extract_quantity(
    line: str,
) -> tuple[str, int | None, str | None]:
    """Return product text, case quantity, and any issue."""

    if len(EXPLICIT_QUANTITY.findall(line)) > 1:
        return line, None, "multiple_quantities"

    for pattern in (
        PREFIX_UNIT,
        MIDDLE_UNIT,
        SUFFIX_UNIT,
    ):
        match = pattern.fullmatch(line)

        if match is None:
            continue

        product_text = match.group("product").strip()
        quantity = int(match.group("qty"))
        unit = match.group("unit").casefold()

        if not 1 <= quantity <= MAX_CASES:
            return product_text, None, "invalid_quantity"

        if not re.fullmatch(CASE_UNITS, unit):
            return product_text, None, "unsupported_unit"

        return product_text, quantity, None

    leading = LEADING_QUANTITY.fullmatch(line)

    if leading:
        return (
            leading.group("product").strip(),
            None,
            "unit_required",
        )

    return line, None, "missing_quantity"


def score_product(
    query: str,
    product: Product,
) -> float:
    """Rank catalogue matches; score is not a probability."""

    normalized_query = normalize(query)

    normalized_sku = normalize(product.sku)
    normalized_name = normalize(product.name)
    normalized_full = normalize(
        f"{product.name} {product.pack}"
    )

    if normalized_query in (
        normalized_sku,
        normalized_name,
        normalized_full,
    ):
        return 1.0

    query_tokens = set(normalized_query.split())

    product_tokens = set(
        normalize(
            f"{product.sku} {product.name} {product.pack}"
        ).split()
    )

    if not query_tokens:
        return 0.0

    overlap = len(query_tokens & product_tokens)

    if overlap:
        coverage = overlap / len(query_tokens)

        similarity = SequenceMatcher(
            None,
            normalized_query,
            normalized_full,
        ).ratio()

        return coverage * (0.75 + 0.25 * similarity)

    # Typo matches can be suggested, never auto-selected.
    best_typo_match = max(
        (
            SequenceMatcher(None, token, candidate).ratio()
            for token in query_tokens
            for candidate in product_tokens
        ),
        default=0.0,
    )

    if best_typo_match >= 0.8:
        return best_typo_match * 0.55

    return 0.0


def parse_line(
    line: str,
    products: Sequence[Product],
) -> ParsedLine:
    product_text, quantity, quantity_issue = (
        extract_quantity(line)
    )

    normalized_query = normalize(product_text)

    ranked = sorted(
        (
            (score_product(product_text, product), product)
            for product in products
        ),
        key=lambda item: (-item[0], item[1].sku),
    )

    useful = [
        (score, product)
        for score, product in ranked
        if score >= 0.4
    ][:3]

    candidates = [
        ProductCandidate(
            sku=product.sku,
            name=product.name,
            pack=product.pack,
            stock_cases=product.stock_cases,
            match_score=round(score * 100),
        )
        for score, product in useful
    ]

    issue = quantity_issue
    selected_sku = None

    if not useful:
        issue = issue or "no_product_match"

    elif issue is None:
        best_score, best_product = useful[0]
        second_score = (
            useful[1][0]
            if len(useful) > 1
            else 0.0
        )

        query_tokens = set(normalized_query.split())
        product_tokens = set(
            normalize(
                f"{best_product.sku} "
                f"{best_product.name} "
                f"{best_product.pack}"
            ).split()
        )

        exact = normalized_query in (
            normalize(best_product.sku),
            normalize(best_product.name),
            normalize(
                f"{best_product.name} {best_product.pack}"
            ),
        )

        strong_match = (
            best_score - second_score >= 0.12
            and (
                exact
                or (
                    len(query_tokens) >= 2
                    and query_tokens <= product_tokens
                    and best_score >= 0.85
                )
            )
        )

        if not strong_match:
            issue = "ambiguous_product"

        elif quantity is not None and (
            quantity > best_product.stock_cases
        ):
            issue = "insufficient_stock"

        else:
            selected_sku = best_product.sku

    return ParsedLine(
        original_text=line,
        product_text=product_text,
        quantity_cases=quantity,
        status="matched" if issue is None else "needs_review",
        issue=issue,
        message=MESSAGES.get(issue) if issue else None,
        selected_sku=selected_sku,
        candidates=candidates,
    )


def parse_order_text(
    text: str,
    products: Sequence[Product],
) -> ParsedOrder:
    """Parse text only. Never create orders or change stock."""

    lines = [
        part.strip()
        for part in SPLIT_LINES.split(text)
        if part.strip()
    ]

    if not lines:
        raise ValueError("Order text cannot be empty")

    if len(lines) > MAX_LINES:
        raise ValueError(
            f"Maximum {MAX_LINES} product lines allowed"
        )

    parsed = [
        parse_line(line, products)
        for line in lines
    ]

    return ParsedOrder(
        lines=parsed,
        has_unresolved_lines=any(
            line.status == "needs_review"
            for line in parsed
        ),
    )
