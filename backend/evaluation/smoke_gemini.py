
import os

import httpx

from app.text_order_ai import (
    MODEL,
    call_gemini,
    merge_suggestions,
)
from app.text_order_parser import parse_order_text

from .text_order_eval import sample_products


def report_http_error(
    error: httpx.HTTPStatusError,
    api_key: str,
) -> None:
    """Display provider errors without exposing credentials."""

    response = error.response

    print("Gemini HTTP status:", response.status_code)

    try:
        data = response.json()
        details = data.get("error", {})

        status = str(
            details.get("status", "UNKNOWN")
        )

        message = str(
            details.get(
                "message",
                "No provider error details returned",
            )
        )

        # Redact the key if it appears in an error.
        status = status.replace(api_key, "[REDACTED]")
        message = message.replace(api_key, "[REDACTED]")

        print("Provider status:", status[:100])
        print("Provider message:", message[:300])

    except (ValueError, AttributeError, TypeError):
        print("Could not decode provider error details.")


def main() -> int:
    api_key = os.getenv(
        "GEMINI_API_KEY", ""
    ).strip()

    if not api_key:
        print(
            "SKIPPED: GEMINI_API_KEY is not configured."
        )
        return 0

    products = sample_products()
    message = "5 peti biscuit chhota"

    parsed = parse_order_text(
        message,
        products,
    )

    print("Testing Gemini structured extraction...")
    print("Model:", MODEL)
    print("Transport: HTTPX")
    print("Using synthetic catalogue data only.")

    try:
        output = call_gemini(
            parsed,
            products,
            api_key,
        )

        reviewed = merge_suggestions(
            parsed,
            output,
            products,
        )

    except httpx.HTTPStatusError as error:
        report_http_error(error, api_key)
        return 1

    except httpx.TimeoutException:
        print("Gemini request timed out.")
        return 1

    except httpx.RequestError as error:
        print("Gemini network request failed.")
        print("Error type:", type(error).__name__)
        return 1

    except Exception as error:
        print("Gemini response validation failed.")
        print("Error type:", type(error).__name__)
        return 1

    print()
    print("PASS: Gemini API request succeeded.")
    print("PASS: Structured JSON was received.")
    print("PASS: Server-side validation completed.")

    print(
        "Parser source:",
        reviewed.parser_source,
    )

    if reviewed.parser_source == "gemini":
        print(
            "Gemini supplied a reviewable "
            "product suggestion."
        )
    else:
        print(
            "No new suggestion was accepted. "
            "The deterministic parser remains available."
        )

    print(
        "No cart, order or inventory changes occurred."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
