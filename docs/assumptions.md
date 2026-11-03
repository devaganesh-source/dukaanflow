
# DukaanFlow — Assumptions

## A01 — Dealer pricing

For the demo, dealer prices quoted in the brief are
treated as prices per individual retail pack.

Case price = pack price × units per case.

This assumption requires confirmation before production use.

## A02 — GST

The brief does not provide a complete tax calculation rule.

GST will not be added to the displayed catalogue subtotal
until the checkout tax treatment is explicitly defined.

## A03 — Demo inventory

Three additional synthetic products are included to
demonstrate catalogue filtering and ordering.

## A04 — Database

SQLite is used for local development.
PostgreSQL is intended for deployment.

## A05 — Authentication

The current catalogue contains demo-only data.

Authentication and retailer-scoped access will be added
before public deployment.
