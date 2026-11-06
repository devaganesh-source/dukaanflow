
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

## A06 — Retailer-specific pricing

Each retailer receives an explicitly assigned price
for each product they are authorized to purchase.

A product without an assigned retailer price is
omitted from that retailer's catalogue.

The Product table retains the demo base price.
The RetailerPrice table stores assigned case prices.

Order-desk accounts may inspect a selected retailer's
catalogue. Retailer accounts may access only their own.

Demo pricing is seeded only when DEMO_MODE=true.
Production retailer prices require an authorized
data import or administrative setup.


## A07 — Authentication

OTP validity is five minutes.

Five incorrect attempts lock the account
for ten minutes. The lockout automatically
expires, and successful verification clears
the failed-attempt state.

Demo mode defaults to disabled.

Demo OTPs are never returned in API responses.

## A08 — Sessions

Sessions expire eight hours after login.

Authentication uses an HttpOnly session cookie
with SameSite=Lax.

Secure cookies are mandatory in production.
The Secure flag is disabled only for local
HTTP development.

## A09 — Cart persistence

Retailer order drafts are stored in browser
localStorage under retailer-specific keys.

Only SKUs and quantities are persisted.

Current product prices and stock are loaded
again from the backend.

Drafts are not yet submitted orders.

## A10 — Order persistence

Orders are linked to the authenticated retailer.

Each order stores a snapshot of product name,
case pack size, charged unit price, paid cases,
free cases, discounts and totals.

Existing order prices are not recalculated when
catalogue prices change.

The same idempotency key cannot create multiple
orders for the same retailer.

New orders initially use the "submitted" status.

Order status transitions and Tally export behavior
will be implemented in later builds.

The checkout API will calculate all order values
on the server using current database prices and stock.

## A11 — Checkout API

Only authenticated retailer accounts may place orders.

The checkout request contains SKUs, quantities in
cases, and an idempotency key.

Retailer prices, schemes and stock quantities are
read and validated on the server.

Free promotional cases consume inventory.

All stock deductions and order inserts occur in
one database transaction.

A failed order rolls back every inventory change.

Repeating an identical request key and cart returns
the existing order without another stock deduction.

Reusing the key with a different cart is rejected.

Order details are scoped to the authenticated
retailer.

SQLite is used for local development. Concurrent
checkout and lock-contention behavior must also
be validated against PostgreSQL before production.

Tax treatment follows the documented catalogue
price assumption; GST is not separately calculated
by this checkout version.
