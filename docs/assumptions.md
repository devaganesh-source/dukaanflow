
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

## A12 — Distributor order dashboard

Order-desk users can view retailer orders across
the distributor's current dataset.

Retailers cannot access distributor dashboard APIs.

The dashboard returns:
- Order counts by status
- Total order value in paise
- Paginated orders
- Retailer names
- Saved order details and item snapshots

Order lists are sorted newest-first using
created_at and order ID.

Status and retailer filters affect the returned
order list and filtered count.

Dashboard summary metrics cover all orders,
regardless of active list filters.

Pagination defaults to 20 orders per page and
is limited to 50.

The dashboard is read-only at this stage.

Order status updates will be added in Build 05C.

Tally-compatible export will be added in a
later Build 05 milestone.

## A15 — Tally export

Orders are exported as TallyPrime Sales Order XML.

Only submitted orders may generate a new export.

Exported XML is stored and can be downloaded
again without a new status event.

Export generation, saved XML, status transition
and audit event share one database transaction.

On-hold orders cannot be exported.

The exported state means XML was generated,
not that TallyPrime accepted the file.

No tax amounts are generated in this demo.

Stock masters are identified by SKU. The Tally
company must have matching master records.

The user must review import errors and possible
duplicate vouchers in TallyPrime.

## A16 — Text order parsing

Build 06A provides a deterministic, read-only
natural-language order parser.

The parser:
- Accepts at most 2,000 characters and 15 lines
- Supports common English and Hinglish terms
- Matches only existing catalogue SKUs
- Supports quantities expressed in cases/peti
- Does not convert pieces, packets or boxes to cases
- Checks requested quantities against current stock
- Flags ambiguous products and unsupported units
- Returns alternatives for retailer review
- Never updates carts, orders or inventory

Matching scores are heuristic relevance scores,
not calibrated AI confidence probabilities.

A matched result still requires retailer
confirmation before it enters the cart.

The later AI integration must be validated
against the same real catalogue and constraints.

## A17 — Gemini-assisted text order matching

Build 06B adds optional Gemini AI assistance to
the existing deterministic text-order parser.

Model: gemini-3.5-flash-lite

Configuration:
- TEXT_ORDER_AI_ENABLED
- GEMINI_API_KEY

Gemini is called only for unresolved text
when AI is enabled and an API key exists.

The backend sends catalogue SKU, name and
pack details to support product matching.

Every AI response is checked against:
- The original parsed lines
- Unchanged case quantities
- Existing catalogue SKUs
- Available stock and unit restrictions

Gemini cannot create new products, confirm a
product selection, create orders or change stock.

AI suggestions remain unresolved and require
retailer confirmation in the review interface.

Provider errors, timeouts, quota limits and
invalid responses fall back to the rules parser.

The parser response includes parser_source:
rules, gemini or fallback.

The system operates without a Gemini API key.

For development, use synthetic messages and
demo catalogue data. Free-tier API content may
be used by Google to improve its products.

Actual AI extraction quality must be evaluated
using the Build 06D evaluation dataset.

## A18 — Retailer text-order review

Build 06C exposes AI-assisted text order parsing
inside the existing retailer catalogue.

The UI calls the protected Next.js route:
POST /api/text-orders/parse

The Next.js route forwards the authenticated
retailer request to the FastAPI parser.

The review displays:
- Each original order line
- Parsed product matches
- Up to three parser suggestions
- Match scores and warnings
- Editable catalogue SKU and case quantity
- Available stock and existing cart quantity

Unresolved lines must be manually corrected
or explicitly skipped.

Unsupported or missing case quantities require
manual input and explicit unit confirmation.

Lines containing multiple quantities must be
split and parsed again, or skipped.

Repeated SKUs are combined before being added
to the existing retailer draft.

The client checks current catalogue stock, but
the backend checkout remains authoritative
for prices, schemes, free cases and stock.

Parsing never creates an order.

Only an explicit retailer confirmation adds
reviewed lines to the existing cart.

The final order is placed through the existing
Build 04 checkout workflow.
