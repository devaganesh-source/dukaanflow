
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
