
import json

from app import text_order_ai as ai
from app.models import Product
from app.text_order_parser import parse_order_text


def products():
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
    ]


def suggestion(
    *,
    text="5 peti biscuit chhota",
    quantity=5,
    sku="SKU-BS-075",
    index=0,
):
    return ai.GeminiOutput(
        matches=[
            ai.GeminiLine(
                line_index=index,
                source_text=text,
                quantity_cases=quantity,
                sku=sku,
            )
        ]
    )


def enable_ai(monkeypatch, output):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    monkeypatch.setattr(
        ai,
        "call_gemini",
        lambda *args: output,
    )


def test_disabled_ai_uses_rules(monkeypatch):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "false")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def unexpected_call(*args):
        raise AssertionError("Gemini should not be called")

    monkeypatch.setattr(
        ai,
        "call_gemini",
        unexpected_call,
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "rules"
    assert result.has_unresolved_lines is True


def test_missing_key_uses_rules(monkeypatch):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "true")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "rules"


def test_exact_match_skips_ai(monkeypatch):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def unexpected_call(*args):
        raise AssertionError("Gemini should not be called")

    monkeypatch.setattr(
        ai,
        "call_gemini",
        unexpected_call,
    )

    result = ai.parse_order_with_ai(
        "2 cases SKU-DT-1KG",
        products(),
    )

    assert result.parser_source == "rules"
    assert result.lines[0].status == "matched"
    assert result.lines[0].selected_sku == "SKU-DT-1KG"


def test_valid_ai_suggestion_requires_review(monkeypatch):
    enable_ai(monkeypatch, suggestion())

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    line = result.lines[0]

    assert result.parser_source == "gemini"
    assert line.status == "needs_review"
    assert line.selected_sku is None
    assert line.quantity_cases == 5
    assert line.candidates[0].sku == "SKU-BS-075"
    assert result.confirmation_required is True


def test_invented_sku_causes_fallback(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(sku="FAKE-SKU"),
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"
    assert result.lines[0].selected_sku is None


def test_changed_quantity_causes_fallback(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(quantity=50),
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"
    assert result.lines[0].quantity_cases == 5


def test_changed_text_causes_fallback(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(text="10 cases biscuit"),
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"


def test_missing_line_causes_fallback(monkeypatch):
    enable_ai(
        monkeypatch,
        ai.GeminiOutput(matches=[]),
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"


def test_duplicate_line_causes_fallback(monkeypatch):
    output = ai.GeminiOutput(
        matches=[
            ai.GeminiLine(
                line_index=0,
                source_text="5 peti biscuit chhota",
                quantity_cases=5,
                sku="SKU-BS-075",
            ),
            ai.GeminiLine(
                line_index=0,
                source_text="2 cases SKU-DT-1KG",
                quantity_cases=2,
                sku="SKU-DT-1KG",
            ),
        ]
    )

    enable_ai(monkeypatch, output)

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota, 2 cases SKU-DT-1KG",
        products(),
    )

    assert result.parser_source == "fallback"


def test_provider_failure_uses_fallback(monkeypatch):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    def provider_failure(*args):
        raise TimeoutError("Simulated timeout")

    monkeypatch.setattr(
        ai,
        "call_gemini",
        provider_failure,
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"


def test_stock_warning_is_preserved(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(
            text="13 cases biscuit 75g",
            quantity=13,
        ),
    )

    result = ai.parse_order_with_ai(
        "13 cases biscuit 75g",
        products(),
    )

    line = result.lines[0]

    assert line.issue == "insufficient_stock"
    assert line.status == "needs_review"
    assert line.selected_sku is None


def test_unsupported_unit_remains_rejected(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(
            text="3 packets biscuit",
            quantity=0,
        ),
    )

    result = ai.parse_order_with_ai(
        "3 packets biscuit",
        products(),
    )

    line = result.lines[0]

    assert line.issue == "unsupported_unit"
    assert line.quantity_cases is None
    assert line.selected_sku is None


def test_empty_ai_suggestion_remains_unresolved(monkeypatch):
    enable_ai(
        monkeypatch,
        suggestion(sku=""),
    )

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products(),
    )

    assert result.parser_source == "fallback"
    assert result.lines[0].status == "needs_review"


def test_large_catalogue_skips_provider(monkeypatch):
    monkeypatch.setenv("TEXT_ORDER_AI_ENABLED", "true")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    result = ai.parse_order_with_ai(
        "5 peti biscuit chhota",
        products() * 40,
    )

    assert result.parser_source == "fallback"



def test_gemini_request_uses_structured_json(monkeypatch):
    parsed = parse_order_text(
        "5 peti biscuit chhota",
        products(),
    )

    response_body = {
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "matches": [
                                        {
                                            "line_index": 0,
                                            "source_text": (
                                                "5 peti biscuit chhota"
                                            ),
                                            "quantity_cases": 5,
                                            "sku": "SKU-BS-075",
                                        }
                                    ]
                                }
                            )
                        }
                    ]
                },
            }
        ]
    }

    class FakeResponse:
        content = json.dumps(
            response_body
        ).encode("utf-8")

        def raise_for_status(self):
            pass

    def fake_post(url, *, headers, json, timeout):
        assert url == ai.GEMINI_URL
        assert timeout == 8.0

        assert (
            headers["x-goog-api-key"]
            == "test-key"
        )

        assert (
            headers["Content-Type"]
            == "application/json"
        )

        format_config = json["generationConfig"][
            "responseFormat"
        ]["text"]

        assert (
            format_config["mimeType"]
            == "APPLICATION_JSON"
        )

        assert (
            format_config["schema"]
            == ai.OUTPUT_SCHEMA
        )

        return FakeResponse()

    monkeypatch.setattr(
        ai.httpx,
        "post",
        fake_post,
    )

    output = ai.call_gemini(
        parsed,
        products(),
        "test-key",
    )

    assert output.matches[0].sku == "SKU-BS-075"
    assert output.matches[0].quantity_cases == 5
