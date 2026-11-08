
from dataclasses import dataclass
from typing import Sequence

from app.models import Product
from app.text_order_parser import parse_order_text


@dataclass(frozen=True)
class ExpectedLine:
    selected_sku: str | None
    quantity_cases: int | None
    issue: str | None = None


@dataclass(frozen=True)
class EvaluationCase:
    name: str
    message: str
    expected: tuple[ExpectedLine, ...]


# These products are synthetic evaluation fixtures.
# They are independent of the local SQLite database.
def sample_products() -> list[Product]:
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


CASES: tuple[EvaluationCase, ...] = (
    EvaluationCase(
        "01_exact_sku",
        "2 cases SKU-DT-1KG",
        (ExpectedLine("SKU-DT-1KG", 2),),
    ),
    EvaluationCase(
        "02_hinglish_detergent",
        "2 peti washing powder 1 kilo",
        (ExpectedLine("SKU-DT-1KG", 2),),
    ),
    EvaluationCase(
        "03_biscuit_pack_size",
        "5 cases biscuit 75g",
        (ExpectedLine("SKU-BS-075", 5),),
    ),
    EvaluationCase(
        "04_generic_biscuit",
        "3 cases biscuit",
        (ExpectedLine(None, 3, "ambiguous_product"),),
    ),
    EvaluationCase(
        "05_small_biscuit_ambiguous",
        "5 peti biscuit chhota",
        (ExpectedLine(None, 5, "ambiguous_product"),),
    ),
    EvaluationCase(
        "06_missing_case_unit",
        "5 biscuit",
        (ExpectedLine(None, None, "unit_required"),),
    ),
    EvaluationCase(
        "07_unsupported_packet_unit",
        "3 packets biscuit 75g",
        (ExpectedLine(None, None, "unsupported_unit"),),
    ),
    EvaluationCase(
        "08_zero_quantity",
        "0 cases biscuit 75g",
        (ExpectedLine(None, None, "invalid_quantity"),),
    ),
    EvaluationCase(
        "09_biscuit_insufficient_stock",
        "13 cases biscuit 75g",
        (ExpectedLine(None, 13, "insufficient_stock"),),
    ),
    EvaluationCase(
        "10_unknown_product",
        "3 cases imaginary wonder product",
        (ExpectedLine(None, 3, "no_product_match"),),
    ),
    EvaluationCase(
        "11_typo_requires_review",
        "3 cases biscut",
        (ExpectedLine(None, 3, "ambiguous_product"),),
    ),
    EvaluationCase(
        "12_two_matched_products",
        "2 cases SKU-DT-1KG, 3 cases biscuit 75g",
        (
            ExpectedLine("SKU-DT-1KG", 2),
            ExpectedLine("SKU-BS-075", 3),
        ),
    ),
    EvaluationCase(
        "13_matched_and_ambiguous",
        (
            "2 peti washing powder 1 kilo, "
            "5 peti biscuit chhota"
        ),
        (
            ExpectedLine("SKU-DT-1KG", 2),
            ExpectedLine(None, 5, "ambiguous_product"),
        ),
    ),
    EvaluationCase(
        "14_tea_exact_sku",
        "1 case SKU-TE-250",
        (ExpectedLine("SKU-TE-250", 1),),
    ),
    EvaluationCase(
        "15_exact_stock_boundary",
        "40 cases SKU-TE-250",
        (ExpectedLine("SKU-TE-250", 40),),
    ),
    EvaluationCase(
        "16_tea_insufficient_stock",
        "41 cases SKU-TE-250",
        (ExpectedLine(None, 41, "insufficient_stock"),),
    ),
    EvaluationCase(
        "17_carton_unit",
        "1 carton SKU-BS-150",
        (ExpectedLine("SKU-BS-150", 1),),
    ),
    EvaluationCase(
        "18_crate_unit",
        "2 crates SKU-DT-1KG",
        (ExpectedLine("SKU-DT-1KG", 2),),
    ),
    EvaluationCase(
        "19_peti_unit",
        "1 peti SKU-BS-075",
        (ExpectedLine("SKU-BS-075", 1),),
    ),
    EvaluationCase(
        "20_quantity_over_limit",
        "1000 cases SKU-BS-075",
        (ExpectedLine(None, None, "invalid_quantity"),),
    ),
    EvaluationCase(
        "21_unsupported_piece_unit",
        "1 piece SKU-BS-075",
        (ExpectedLine(None, None, "unsupported_unit"),),
    ),
    EvaluationCase(
        "22_multiple_quantities_one_line",
        "2 cases biscuit 3 cases detergent",
        (ExpectedLine(None, None, "multiple_quantities"),),
    ),
    EvaluationCase(
        "23_no_quantity",
        "hello",
        (ExpectedLine(None, None, "missing_quantity"),),
    ),
    EvaluationCase(
        "24_full_product_and_pack",
        "3 cases Glucose Biscuit 150 g",
        (ExpectedLine("SKU-BS-150", 3),),
    ),
    EvaluationCase(
        "25_hinglish_tea",
        "1 peti chai patti 250 wala",
        (ExpectedLine("SKU-TE-250", 1),),
    ),
)


def evaluate_case(
    case: EvaluationCase,
    products: Sequence[Product],
) -> tuple[list[str], int, int]:
    """
    Return:
    - mismatch descriptions
    - count of unsafe/wrong automatic SKU selections
    - count of fully correct lines
    """
    errors: list[str] = []
    unsafe_selections = 0
    correct_lines = 0

    try:
        result = parse_order_text(
            case.message,
            products,
        )
    except Exception as error:
        return [f"Parser raised {type(error).__name__}"], 0, 0

    if not result.confirmation_required:
        errors.append("Confirmation requirement was lost")

    if len(result.lines) != len(case.expected):
        errors.append(
            f"Expected {len(case.expected)} lines, "
            f"received {len(result.lines)}"
        )

    for index, expected in enumerate(case.expected):
        if index >= len(result.lines):
            continue

        actual = result.lines[index]

        expected_status = (
            "matched"
            if expected.issue is None
            else "needs_review"
        )

        differences: list[str] = []

        if actual.selected_sku != expected.selected_sku:
            differences.append(
                f"SKU: expected {expected.selected_sku}, "
                f"got {actual.selected_sku}"
            )

        if actual.quantity_cases != expected.quantity_cases:
            differences.append(
                f"Quantity: expected {expected.quantity_cases}, "
                f"got {actual.quantity_cases}"
            )

        if actual.issue != expected.issue:
            differences.append(
                f"Issue: expected {expected.issue}, "
                f"got {actual.issue}"
            )

        if actual.status != expected_status:
            differences.append(
                f"Status: expected {expected_status}, "
                f"got {actual.status}"
            )

        if (
            actual.selected_sku is not None
            and actual.selected_sku != expected.selected_sku
        ):
            unsafe_selections += 1

        if differences:
            errors.append(
                f"Line {index + 1}: " + "; ".join(differences)
            )
        else:
            correct_lines += 1

    return errors, unsafe_selections, correct_lines


def run_evaluation() -> int:
    products = sample_products()

    passed_cases = 0
    correct_lines = 0
    unsafe_selections = 0

    print("\nDukaanFlow — Text Order Evaluation")
    print("=" * 48)
    print("Mode: deterministic parser, no Gemini API calls")
    print(f"Dataset: {len(CASES)} synthetic messages\n")

    for case in CASES:
        errors, unsafe, correct = evaluate_case(
            case,
            products,
        )

        correct_lines += correct
        unsafe_selections += unsafe

        if not errors:
            passed_cases += 1
            print(f"PASS  {case.name}")
        else:
            print(f"FAIL  {case.name}")
            for error in errors:
                print(f"      {error}")

    total_lines = sum(
        len(case.expected)
        for case in CASES
    )

    accuracy = (
        100 * passed_cases / len(CASES)
        if CASES
        else 0
    )

    print("\n" + "=" * 48)
    print(
        f"Exact cases: {passed_cases}/{len(CASES)} "
        f"({accuracy:.1f}%)"
    )
    print(
        f"Correct lines: {correct_lines}/{total_lines}"
    )
    print(
        f"Unsafe/wrong automatic SKU selections: "
        f"{unsafe_selections}"
    )
    print(
        "Scope: fixed synthetic evaluation set; "
        "not live Gemini accuracy."
    )

    return (
        0
        if passed_cases == len(CASES)
        and unsafe_selections == 0
        else 1
    )


if __name__ == "__main__":
    raise SystemExit(run_evaluation())
