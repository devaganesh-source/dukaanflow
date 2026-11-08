
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import require_retailer
from app.database import Base, get_db
from app.main import app
from app.models import Product
from app.text_order_parser import parse_order_text


def sample_products():
    return [
        Product(
            sku="SKU-BS-075",
            name="Glucose Biscuit",
            category="Snacks",
            pack="75 g",
            price_paise=76500,
            stock_cases=12,
            scheme=None,
        ),
        Product(
            sku="SKU-BS-150",
            name="Glucose Biscuit",
            category="Snacks",
            pack="150 g",
            price_paise=95000,
            stock_cases=20,
            scheme=None,
        ),
        Product(
            sku="SKU-DT-1KG",
            name="Detergent Powder",
            category="Home Care",
            pack="1 kg",
            price_paise=203000,
            stock_cases=30,
            scheme=None,
        ),
        Product(
            sku="SKU-TE-250",
            name="Tea Leaves",
            category="Grocery",
            pack="250 g",
            price_paise=18000,
            stock_cases=40,
            scheme=None,
        ),
    ]


def only_line(text, products=None):
    parsed = parse_order_text(
        text,
        products if products is not None else sample_products(),
    )
    assert len(parsed.lines) == 1
    return parsed.lines[0]


def test_exact_sku_match():
    line = only_line("2 cases SKU-DT-1KG")

    assert line.status == "matched"
    assert line.quantity_cases == 2
    assert line.selected_sku == "SKU-DT-1KG"


def test_hinglish_quantity_and_product():
    line = only_line(
        "2 peti washing powder 1 kilo"
    )

    assert line.status == "matched"
    assert line.quantity_cases == 2
    assert line.selected_sku == "SKU-DT-1KG"


def test_pack_size_match():
    line = only_line("5 cases biscuit 75g")

    assert line.status == "matched"
    assert line.selected_sku == "SKU-BS-075"


def test_ambiguous_biscuit_needs_review():
    line = only_line("5 peti biscuit chhota")

    assert line.status == "needs_review"
    assert line.selected_sku is None
    assert len(line.candidates) >= 1


def test_generic_product_needs_review():
    line = only_line("3 cases biscuit")

    assert line.status == "needs_review"
    assert line.selected_sku is None


def test_missing_unit_needs_review():
    line = only_line("5 biscuit")

    assert line.status == "needs_review"
    assert line.issue == "unit_required"
    assert line.quantity_cases is None


def test_piece_units_are_not_converted():
    line = only_line(
        "2 packets Glucose Biscuit 75g"
    )

    assert line.status == "needs_review"
    assert line.issue == "unsupported_unit"
    assert line.quantity_cases is None


def test_zero_quantity_rejected():
    line = only_line("0 cases biscuit 75g")

    assert line.status == "needs_review"
    assert line.issue == "invalid_quantity"
    assert line.selected_sku is None


def test_stock_limit_prevents_auto_match():
    line = only_line("13 cases biscuit 75g")

    assert line.status == "needs_review"
    assert line.issue == "insufficient_stock"
    assert line.selected_sku is None


def test_unknown_product_is_not_invented():
    line = only_line(
        "3 cases imaginary wonder product"
    )

    assert line.status == "needs_review"
    assert line.issue == "no_product_match"
    assert line.selected_sku is None
    assert line.candidates == []


def test_typo_can_be_suggested_not_selected():
    line = only_line("3 cases biscut")

    assert line.status == "needs_review"
    assert line.selected_sku is None


def test_multiple_lines():
    result = parse_order_text(
        "2 cases SKU-DT-1KG, 3 cases biscuit 75g",
        sample_products(),
    )

    assert len(result.lines) == 2
    assert result.lines[0].quantity_cases == 2
    assert result.lines[1].quantity_cases == 3
    assert result.has_unresolved_lines is False
    assert result.confirmation_required is True


def test_multiple_quantities_in_one_line():
    line = only_line(
        "2 cases biscuit 3 cases detergent"
    )

    assert line.status == "needs_review"
    assert line.issue == "multiple_quantities"


def test_too_many_lines_rejected():
    message = ", ".join(
        ["1 case biscuit 75g"] * 16
    )

    with pytest.raises(ValueError):
        parse_order_text(
            message,
            sample_products(),
        )


@pytest.fixture
def api_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    Base.metadata.create_all(engine)

    with Session(engine) as db:
        db.add_all(sample_products())
        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    # Authentication itself is already tested in
    # Build 03B. Override the retailer dependency
    # here to test the parser's API behavior.
    def override_retailer():
        return object()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[
        require_retailer
    ] = override_retailer

    try:
        with TestClient(app) as client:
            yield client, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_parse_endpoint_returns_review_data(api_env):
    client, _ = api_env

    response = client.post(
        "/api/text-orders/parse",
        json={
            "text": (
                "2 peti washing powder 1 kilo, "
                "5 peti biscuit chhota"
            )
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert len(data["lines"]) == 2
    assert data["lines"][0]["status"] == "matched"
    assert data["lines"][1]["status"] == "needs_review"
    assert data["has_unresolved_lines"] is True
    assert data["confirmation_required"] is True


def test_parse_endpoint_rejects_empty_text(api_env):
    client, _ = api_env

    response = client.post(
        "/api/text-orders/parse",
        json={"text": "   "},
    )

    assert response.status_code == 422


def test_parse_endpoint_requires_auth(api_env):
    client, _ = api_env

    app.dependency_overrides.pop(
        require_retailer
    )

    response = client.post(
        "/api/text-orders/parse",
        json={"text": "2 cases biscuit 75g"},
    )

    assert response.status_code == 401


def test_parse_does_not_change_stock(api_env):
    client, engine = api_env

    response = client.post(
        "/api/text-orders/parse",
        json={"text": "2 cases SKU-DT-1KG"},
    )

    assert response.status_code == 200

    with Session(engine) as db:
        product = db.get(
            Product,
            "SKU-DT-1KG",
        )

        assert product is not None
        assert product.stock_cases == 30


def test_parse_endpoint_reports_ai_fallback(
    api_env,
    monkeypatch,
):
    from app import text_order_ai

    client, _ = api_env

    monkeypatch.setenv(
        "TEXT_ORDER_AI_ENABLED", "true"
    )
    monkeypatch.setenv(
        "GEMINI_API_KEY", "test-key"
    )

    def fail_provider(*args):
        raise TimeoutError("Simulated provider timeout")

    monkeypatch.setattr(
        text_order_ai,
        "call_gemini",
        fail_provider,
    )

    response = client.post(
        "/api/text-orders/parse",
        json={
            "text": "5 peti biscuit chhota",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["parser_source"] == "fallback"
    assert data["confirmation_required"] is True
    assert data["lines"][0]["selected_sku"] is None
