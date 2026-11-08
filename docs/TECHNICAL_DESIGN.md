
# DukaanFlow - Technical Design Document

**GitHub:** https://github.com/devaganesh-source/dukaanflow  
**Project:** Isocode Labs - Software Engineering Intern take-home, Brief 3  
**Prepared:** 8 November 2026  
**Version:** 1.0 | **Status:** Local application verified; no public live deployment claimed

## 1. Executive summary

DukaanFlow is a full-stack FMCG ordering prototype for a distributor serving kirana retailers. The client brief describes approximately 1,800 shops and an order process that relies on handwritten notes, WhatsApp messages and manual entry into Tally. Retailers need a quick way to see available stock and schemes; the order desk needs fewer ambiguous lines to correct.

The implemented product has two roles: **retailer** and **distributor order desk**. A retailer can browse a catalogue, build a case-based cart, place an order and paste English/Hinglish text such as `2 peti washing powder 1 kilo, 5 cases biscuit 75g`. The app proposes SKU matches and quantities, but requires human review before adding them to the cart. The distributor can review orders, manage status and credit holds, inspect history, and export a Tally Sales Order XML document.

**Core principle:** deterministic code owns money, schemes, inventory and authorization; AI suggests product identity, never approves or places an order. The rules-based parser also works when Gemini is disabled or unavailable.

## 2. Scope and product decisions

| Implemented in this prototype | Deliberately cut / not verified |
|---|---|
| Demo OTP sign-in and separate retailer/order-desk access | Production SMS OTP provider |
| Catalogue, stock, price/scheme presentation, cart and checkout | Offline salesman mode and installable PWA guarantees |
| English/Hinglish text capture with review and manual corrections | Photo and Hindi voice-note capture |
| Optional live-tested Gemini suggestion layer; safe rules fallback | Automated learning from retailer corrections |
| Retailer order history; distributor order management and credit holds | Full administrative catalogue editor and van loading lists |
| Tally Sales Order XML generation and repeat download | Actual import into a live TallyPrime company |

The original proposal mentioned PostgreSQL, CSV export and broader omnichannel capture. The **actual delivered system** uses local SQLite and generates **Tally Sales Order XML**. This design document describes the implementation rather than treating those early plans as completed work.

## 3. Architecture and rationale

```text
Retailer / order desk (browser)
           |
           v
Next.js 16 + React 19 + TypeScript + Tailwind
  |  App Router pages and server-side API routes
           |
           v
FastAPI (Python) - authenticated business API
  |-- Demo OTP, sessions and role checks
  |-- Product catalogue and pricing/schemes
  |-- Checkout, orders and distributor review
  |-- Deterministic text-order parser
  |       `-- Optional Gemini structured suggestions
  |-- Tally XML export and audit/status history
           |
           v
SQLAlchemy -> SQLite (local default)
```

| Decision | Why it fits the brief | Trade-off |
|---|---|---|
| Next.js App Router + TypeScript | Responsive retailer UI and straightforward route handling | Two runtime processes in local development |
| FastAPI + Pydantic | Explicit request/response validation; testable business APIs | Requires production deployment and secret management |
| SQLAlchemy + SQLite default | Small reproducible local demo without managed infrastructure | SQLite is not the intended scaled multi-user deployment choice |
| Rules first, Gemini second | Common orders work deterministically; external failure is survivable | Ambiguous language still needs human attention |
| Human review gate | Prevents silent AI purchase decisions | Adds a deliberate confirmation step |
| Tally XML instead of live Tally connection | Generates a tangible accounting handoff | Import and master-name compatibility require customer testing |

**Logical data model.** Persistent concepts include users and sessions; OTP challenges; catalogue products and stock; orders and their lines; order status and credit-hold information; and export/history records. Known authentication/catalogue tables include `users`, `user_sessions`, `otp_challenges` and `products`. Order-related entities are managed by the FastAPI order modules. This is a **logical view**, not an assertion that every concept is a separate SQL table; the precise physical schema is defined by `backend/app/models.py`.

**Service boundaries.** Authentication is handled in `auth.py`; catalogue in `catalog.py`; order placement in `orders.py`; distributor workflows in `order_desk_orders.py` and `order_desk_status.py`; pricing in `pricing.py`; text parsing in `text_order_parser.py` and `text_order_ai.py`; accounting export in `tally_export.py` and `order_desk_export.py`. The frontend uses API route handlers to reach FastAPI without exposing the backend origin to browser code.

## 4. Primary workflows

### 4.1 Sign-in and role isolation

A demo user enters a phone number and OTP. FastAPI validates the challenge, creates a session and associates the user with the retailer or desk role. Session cookies are used for subsequent requests. Distributor actions require desk authorization; retailer order access is scoped to the authenticated retailer. The documented demo policy locks an account for ten minutes after five incorrect OTP attempts. Demo mode must be disabled for production use.

### 4.2 Catalogue to checkout

The retailer browses seeded products, filters/searches, chooses case quantities and reviews the cart. Pricing and promotions are computed by backend rules rather than by the LLM. Checkout creates the stored order; the retailer can see its history. The order desk then handles the operational review and status transitions.

### 4.3 Text-order capture with manual review

1. The retailer enters a message through **Order by message**.
2. FastAPI runs the rules parser to extract individual order lines, potential products, case quantities and validation issues.
3. If unresolved lines remain and AI is enabled, a Gemini request includes only a limited catalogue and parsed source lines; structured JSON is requested.
4. Server-side checks reject invented SKUs, altered quantities, changed source lines, duplicate/missing line indices and invalid outputs. Gemini can reorder *suggestions* but cannot silently confirm an uncertain SKU.
5. The UI shows the original text, alternatives, selected product and editable case quantity for each line. The user can skip a line or correct its product.
6. On explicit confirmation, validated quantities are merged into the existing cart. A separate checkout action is still required to create an order.

The message draft is saved locally per retailer so a refresh does not discard typing. The saved message is cleared following a successful add-to-cart confirmation. This is local browser convenience, not cross-device draft synchronization.

**Failure policy:** missing/invalid model output, network failure or disabled AI falls back to the deterministic parser and review UI. Unsupported units and ambiguous products must be corrected by a human; the app does not assume packets equal cases.

### 4.4 Distributor processing and Tally export

A desk user reviews the order queue and order details, including credit-hold/status actions and audit history. The export path generates Tally Sales Order XML with the stored quantities, amounts and relevant ledger/stock references. Repeat downloads use the saved XML for the same export. **Exported** is an internal application status, **not** proof that TallyPrime imported the document successfully.

## 5. Pricing, stock and explicit assumptions

Business logic is deterministic. The supplied sample brief uses case units and illustrates (i) free goods for a 10+1 biscuit scheme and (ii) a 3% detergent slab at five or more cases. For example, at the brief's illustrative unit prices, a biscuit case has 96 pieces at INR 8.10 each (INR 777.60/case), and a detergent case has 20 pieces at INR 101.50 each (INR 2,030/case). These are **sample assumptions**, not externally verified commercial prices.

| ID | Labelled assumption / treatment |
|---|---|
| A1 | Dealer prices in the sample brief are per piece; the user orders in cases. |
| A2 | `stock_cases` denotes case-based available stock. |
| A3 | The 10+1 free-goods scheme repeats for complete blocks of ten paid cases. |
| A4 | Free goods count toward required stock, not only billed quantity. |
| A5 | A qualifying percentage slab applies to the specified purchased line. |
| A6 | A SKU has one applicable demo scheme; scheme stacking is not assumed. |
| A7 | GST behavior was an initial design assumption. This document does not claim a fully verified GST-inclusive price switch; the Tally export excludes GST. |
| A8 | Monetary calculations use integer paise and documented rounding rules to avoid float drift. |
| A9 | Credit limits/outstanding balances are illustrative seeded business values; the desk supports credit holds. |
| A10 | OTP authentication uses an explicit local demo mode, not real SMS delivery. |
| A11 | Original design contemplated CSV; **implemented handoff is Tally Sales Order XML**, with real import unverified. |
| A12 | Informal words such as `chhota` can remain ambiguous; selection is reviewed rather than guessed. Persistent alias learning is not claimed. |
| A13 | Products, accounts, histories and evaluation messages beyond the client examples are synthetic demonstration data. |

**Additional implementation assumptions:** 5 OTP failures trigger a 10-minute lockout; secure cookies require HTTPS in production; demo sessions and `SESSION_SECRET` are configured via environment; local SQLite is a demonstration default. Any actual deployment must establish appropriate cookie, CSRF, rate-limit, secret-rotation, backup and data-retention controls.

## 6. UI and interaction design

The retailer experience favors a quiet white/green palette, wide cards, labelled quantities and prominent primary actions rather than dense ERP forms. The catalogue embeds text ordering alongside normal browsing so the user does not need a separate capture workflow. A review row shows the **original line**, machine suggestions, visible match scores, product selector, quantity input and a **Skip** control. Scores indicate text similarity; they are not a calibrated probability that an AI is correct.

The distributor experience deliberately differs: a desktop-oriented queue, order details, state transitions and explicit export actions support staff review rather than rapid shopping. Loading/error feedback and role-specific navigation are handled by the frontend. A live screenshot from the local browser is reproduced in the PDF edition as a visual example of the two-line review state.

**Usability intent:** a retailer should be able to finish a common order quickly with minimal typing. Performance on throttled 3G, complete mobile accessibility and full end-to-end interaction latency have **not been independently benchmarked**; these remain validation items, not claimed results.

## 7. Reliability, security and privacy

- **Authorization:** server-side role checks are necessary even if the UI hides the desk routes; cross-retailer access is a dedicated security scenario.
- **Input integrity:** backend validation controls quantities, SKU selection and order creation. AI output is untrusted input and must be validated before use.
- **Authentication:** local demo OTP, session secret, lockout and production secure-cookie configuration are documented. A real OTP provider is not implemented.
- **Credential handling:** API credentials must live in local/deployment secrets, not `.env.example` or Git. A mistakenly staged Gemini credential was removed from the unpublished commit before GitHub accepted the initial push; the affected key must be revoked independently.
- **External model privacy:** use synthetic messages for development smoke tests; customer-identifying data should not be sent to a third-party model without appropriate authorization and safeguards.
- **Known hardening gaps:** production SMS integration, CSRF review, rate limiting/monitoring, database migrations/backups, hosted HTTPS and full threat-model review.

## 8. Verification evidence and limits

| Verification | Observed result | What it establishes |
|---|---|---|
| Backend regression (pytest) | **141 passed**, one non-blocking dependency deprecation warning | Tested API/domain behavior in local environment |
| Deterministic message evaluation | **25/25 messages**, **27/27 expected lines** | Correct behavior on this fixed synthetic fixture set |
| Unsafe automatic SKU selections | **0 in the evaluation** | No incorrect auto-selection in those 25 cases only |
| Gemini live smoke test | **Passed** via HTTPX; structured JSON validated; source `gemini` | Working synthetic live request and validation path |
| Frontend checks | TypeScript, ESLint and Next.js production build **passed** | Compilation and lint quality, not real-user task completion |
| Browser check | Two-line detergent/biscuit review shown locally | UI correctly displayed extracted quantities and matches |
| Tally export | Automated XML generation and repeat-download tests | Output generation; **not** live TallyPrime import |

A complete retailer-login -> text capture -> cart -> checkout -> desk -> export browser walkthrough, a mobile-device check and measured 3G timings should be recorded separately before submission if performed. They are not asserted here as completed. The synthetic parser evaluation is **not** a claim of 100% accuracy on real-world or unseen-language orders.

## 9. Trade-offs, risks and next steps

The principal trade-off is scope. Rather than half-implement every feature in the original brief, the prototype completes a connected **retailer -> order -> distributor** vertical slice and treats text AI as a review assistant. SQLite and demo authentication simplify reviewer setup but require replacement/hardening for production. The AI may be unavailable or misleading; deterministic rules and human confirmation mitigate the failure mode without eliminating it.

**Next prioritized work:** (1) verify the full browser flow on mobile and the target demo environment; (2) deploy behind HTTPS with production secrets, real OTP and persistent storage; (3) validate and adapt Tally XML against customer masters; (4) test real anonymized order language and improve aliases/quality measurement; (5) consider photo/voice capture, offline salesman mode, repeat-order enhancements and operational dashboards only after core reliability.

## 10. Reviewer quick walkthrough

1. Follow the root `deployment.md` in the repository and use the documented fictional retailer demo login.
2. Browse the catalogue and paste: `2 peti washing powder 1 kilo, 5 cases biscuit 75g`.
3. Inspect the two suggestions, case quantities, and **Confirm reviewed items and add to cart** control.
4. Place a test order, then sign in as the distributor desk; inspect the order and try a supported status action.
5. Download Tally Sales Order XML; remember that import into TallyPrime was not validated.
6. Disable Gemini and repeat text parsing to see the standalone rules fallback.

**Source of truth:** implementation and tests at https://github.com/devaganesh-source/dukaanflow. Configuration and demo instructions are in repository-root `deployment.md`; further assumptions are in `docs/assumptions.md`. This document is intended as a transparent engineering account of a take-home prototype, not a statement of production readiness.
