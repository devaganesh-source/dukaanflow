
import pytest

from app.pricing import PricingError, calculate_line


def test_buy_ten_get_one_free():
    quote = calculate_line(
        sku="SKU-BS-075",
        quantity_cases=10,
        unit_price_paise=76500,
        stock_cases=340,
    )

    assert quote.paid_cases == 10
    assert quote.free_cases == 1
    assert quote.total_cases == 11
    assert quote.subtotal_paise == 765000
    assert quote.discount_paise == 0
    assert quote.total_paise == 765000
    assert quote.scheme_applied is True


def test_buy_get_below_threshold():
    quote = calculate_line(
        sku="SKU-BS-075",
        quantity_cases=9,
        unit_price_paise=76500,
        stock_cases=340,
    )

    assert quote.free_cases == 0
    assert quote.total_cases == 9
    assert quote.scheme_applied is False


def test_multiple_free_cases():
    quote = calculate_line(
        sku="SKU-BS-075",
        quantity_cases=20,
        unit_price_paise=76500,
        stock_cases=340,
    )

    assert quote.free_cases == 2
    assert quote.total_cases == 22


def test_percentage_discount():
    quote = calculate_line(
        sku="SKU-DT-1KG",
        quantity_cases=5,
        unit_price_paise=203000,
        stock_cases=85,
    )

    assert quote.subtotal_paise == 1015000
    assert quote.discount_paise == 30450
    assert quote.total_paise == 984550
    assert quote.scheme_applied is True


def test_discount_below_threshold():
    quote = calculate_line(
        sku="SKU-DT-1KG",
        quantity_cases=4,
        unit_price_paise=203000,
        stock_cases=85,
    )

    assert quote.discount_paise == 0
    assert quote.scheme_applied is False


def test_free_goods_require_stock():
    with pytest.raises(PricingError, match="Insufficient stock"):
        calculate_line(
            sku="SKU-BS-075",
            quantity_cases=10,
            unit_price_paise=76500,
            stock_cases=10,
        )


def test_out_of_stock_product():
    with pytest.raises(PricingError, match="Insufficient stock"):
        calculate_line(
            sku="SKU-TE-250",
            quantity_cases=1,
            unit_price_paise=472000,
            stock_cases=0,
        )


@pytest.mark.parametrize("quantity", [0, -1, 2.5, True])
def test_invalid_quantities(quantity):
    with pytest.raises(PricingError):
        calculate_line(
            sku="SKU-BS-075",
            quantity_cases=quantity,
            unit_price_paise=76500,
            stock_cases=340,
        )


def test_product_without_scheme():
    quote = calculate_line(
        sku="OIL-1L",
        quantity_cases=2,
        unit_price_paise=168000,
        stock_cases=28,
    )

    assert quote.free_cases == 0
    assert quote.discount_paise == 0
    assert quote.total_paise == 336000


def test_discount_rounds_to_nearest_paise():
    quote = calculate_line(
        sku="SKU-DT-1KG",
        quantity_cases=5,
        unit_price_paise=333,
        stock_cases=20,
    )

    assert quote.subtotal_paise == 1665
    assert quote.discount_paise == 50
    assert quote.total_paise == 1615
