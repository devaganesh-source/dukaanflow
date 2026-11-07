
import os
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

from .models import Order


IST = timezone(timedelta(hours=5, minutes=30))


def rupees(paise: int) -> str:
    """Convert integer paise to a Tally amount string."""
    sign = "-" if paise < 0 else ""
    amount = abs(paise)

    return f"{sign}{amount // 100}.{amount % 100:02d}"


def field(
    parent: ET.Element,
    tag: str,
    value: object,
) -> ET.Element:
    """Add an XML element containing text."""
    element = ET.SubElement(parent, tag)
    element.text = str(value)
    return element


def ledger_entry(
    voucher: ET.Element,
    *,
    name: str,
    amount_paise: int,
    party: bool = False,
) -> None:
    """Add a ledger entry to the voucher."""
    entry = ET.SubElement(
        voucher,
        "LEDGERENTRIES.LIST",
    )

    field(entry, "LEDGERNAME", name)

    field(
        entry,
        "ISDEEMEDPOSITIVE",
        "Yes" if amount_paise < 0 else "No",
    )

    if party:
        field(entry, "ISPARTYLEDGER", "Yes")

    field(entry, "AMOUNT", rupees(amount_paise))


def build_tally_xml(
    order: Order,
    retailer_name: str,
) -> str:
    """Generate Sales Order XML from a saved order."""

    if not order.items:
        raise ValueError("Order has no items")

    if not retailer_name.strip():
        raise ValueError("Retailer ledger name is missing")

    # Verify the saved order totals.
    subtotal = sum(
        item.subtotal_paise for item in order.items
    )

    discount = sum(
        item.discount_paise for item in order.items
    )

    if (
        subtotal != order.subtotal_paise
        or discount != order.discount_paise
        or subtotal - discount != order.total_paise
    ):
        raise ValueError("Order totals are inconsistent")

    # Names must match masters configured in Tally.
    unit = os.getenv("TALLY_UNIT_NAME", "CASE")

    sales_ledger = os.getenv(
        "TALLY_SALES_LEDGER",
        "Sales",
    )

    discount_ledger = os.getenv(
        "TALLY_DISCOUNT_LEDGER",
        "Scheme Discounts",
    )

    if not all(
        name.strip()
        for name in (
            unit,
            sales_ledger,
            discount_ledger,
        )
    ):
        raise ValueError(
            "Tally master names cannot be blank"
        )

    order_date = datetime.fromtimestamp(
        order.created_at,
        IST,
    ).strftime("%Y%m%d")

    reference = f"DF-{order.id}"

    # XML envelope
    root = ET.Element("ENVELOPE")

    header = ET.SubElement(root, "HEADER")

    field(header, "VERSION", 1)
    field(header, "TALLYREQUEST", "Import")
    field(header, "TYPE", "Data")
    field(header, "ID", "Vouchers")

    body = ET.SubElement(root, "BODY")
    ET.SubElement(body, "DESC")

    data = ET.SubElement(body, "DATA")
    message = ET.SubElement(data, "TALLYMESSAGE")

    # Sales Order voucher
    voucher = ET.SubElement(
        message,
        "VOUCHER",
        {
            "VCHTYPE": "Sales Order",
            "ACTION": "Create",
            "OBJVIEW": "Invoice Voucher View",
        },
    )

    field(voucher, "DATE", order_date)
    field(voucher, "VOUCHERTYPENAME", "Sales Order")
    field(voucher, "VOUCHERNUMBER", reference)
    field(voucher, "REFERENCE", reference)

    field(voucher, "PARTYLEDGERNAME", retailer_name)
    field(voucher, "PARTYNAME", retailer_name)

    field(
        voucher,
        "PERSISTEDVIEW",
        "Invoice Voucher View",
    )

    field(voucher, "ISINVOICE", "Yes")

    field(
        voucher,
        "NARRATION",
        (
            f"DukaanFlow order {order.id}. "
            "Values exclude GST. "
            "Free goods are included in actual quantity."
        ),
    )

    # Party ledger: net amount receivable.
    ledger_entry(
        voucher,
        name=retailer_name,
        amount_paise=-order.total_paise,
        party=True,
    )

    # Export each saved order item.
    for item in order.items:
        if (
            item.total_cases
            != item.paid_cases + item.free_cases
            or item.paid_cases <= 0
            or item.unit_price_paise <= 0
            or item.subtotal_paise
            != item.paid_cases * item.unit_price_paise
            or item.total_paise
            != item.subtotal_paise - item.discount_paise
        ):
            raise ValueError(
                f"Inconsistent order item: {item.product_sku}"
            )

        entry = ET.SubElement(
            voucher,
            "ALLINVENTORYENTRIES.LIST",
        )

        field(
            entry,
            "STOCKITEMNAME",
            item.product_sku,
        )

        field(
            entry,
            "ISDEEMEDPOSITIVE",
            "No",
        )

        field(
            entry,
            "RATE",
            f"{rupees(item.unit_price_paise)}/{unit}",
        )

        # Gross amount before scheme discount.
        field(
            entry,
            "AMOUNT",
            rupees(item.subtotal_paise),
        )

        # Includes promotional free cases.
        field(
            entry,
            "ACTUALQTY",
            f" {item.total_cases} {unit}",
        )

        # Only purchased cases are billed.
        field(
            entry,
            "BILLEDQTY",
            f" {item.paid_cases} {unit}",
        )

        allocation = ET.SubElement(
            entry,
            "ACCOUNTINGALLOCATIONS.LIST",
        )

        field(
            allocation,
            "LEDGERNAME",
            sales_ledger,
        )

        field(
            allocation,
            "ISDEEMEDPOSITIVE",
            "No",
        )

        field(
            allocation,
            "AMOUNT",
            rupees(item.subtotal_paise),
        )

    # Separate discount ledger for promotional discounts.
    if order.discount_paise > 0:
        ledger_entry(
            voucher,
            name=discount_ledger,
            amount_paise=-order.discount_paise,
        )

    # Return complete UTF-8 XML.
    xml_bytes = ET.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
    )

    return xml_bytes.decode("utf-8")
