
# DukaanFlow

**AI-assisted retailer ordering for FMCG distributors.**

[GitHub Repository](https://github.com/devaganesh-source/dukaanflow) | [Local Setup](deployment.md) | [Assumptions](docs/assumptions.md)

DukaanFlow is a full-stack ordering application that helps
kirana retailers browse stock, see promotional schemes,
place orders and convert informal English or Hinglish
messages into reviewable order drafts.

It also provides a distributor order desk for managing
orders, credit holds, audit history and Tally Sales Order
XML exports.

Built for the Isocode Labs Software Engineering Intern
take-home assignment.

## The Problem

FMCG retailers often order through salespeople or
informal messages. Manual re-entry can introduce
quantity mistakes, missed promotional schemes and
stock-related delays.

DukaanFlow simplifies this process with a connected
retailer ordering and distributor review workflow.

## Features

### Retailer experience

- Demo OTP authentication
- Mobile-friendly product catalogue
- Search and category filtering
- Case-based product quantities
- Stock availability and promotional schemes
- Cart and order checkout
- Retailer order history
- English and Hinglish text-order capture
- Product matching and quantity extraction
- Explicit review before adding suggested items to cart

### Distributor experience

- Separate order-desk authentication
- Distributor order queue and order details
- Order status management
- Credit hold and release workflow
- Status and action history
- Tally Sales Order XML export
- Repeat download of previously generated export XML

### AI-assisted ordering

The text-order assistant combines deterministic
parsing with optional Google Gemini suggestions.

The workflow is:

1. Retailer enters an informal order message.
2. Rules identify products, units and case quantities.
3. Optional Gemini assistance suggests uncertain SKUs.
4. Suggested SKUs are validated against the catalogue.
5. Retailer reviews and corrects extracted lines.
6. Confirmed items are added to the existing cart.
7. Checkout independently validates the final order.

AI suggestions cannot directly place orders.

If Gemini is unavailable, the deterministic parser
continues working.

## Architecture

```text
Retailer / Distributor
         |
         v
  Next.js Frontend
         |
         v
 Next.js API Routes
         |
         v
     FastAPI
         |
         +---- Authentication and roles
         +---- Catalogue and pricing
         +---- Orders and checkout
         +---- Order desk and audit
         +---- Text-order parsing
         |       |
         |       +-- Deterministic rules
         |       +-- Optional Gemini API
         |
         +---- Tally XML generation
         |
         v
 SQLite / SQLAlchemy
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Database | SQLite, SQLAlchemy |
| AI | Google Gemini API, deterministic parser |
| Testing | pytest, TypeScript, ESLint |
| Accounting integration | Tally Sales Order XML |

## Project Structure

```text
dukaanflow/
├── backend/
│   ├── app/
│   │   ├── auth.py
│   │   ├── catalog.py
│   │   ├── database.py
│   │   ├── orders.py
│   │   ├── pricing.py
│   │   ├── text_order_parser.py
│   │   ├── text_order_ai.py
│   │   └── tally_export.py
│   ├── evaluation/
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/
│       └── components/
└── docs/
    ├── assumptions.md
    └── deployment.md
```

## Getting Started

Follow [deployment.md](deployment.md) for complete
Windows PowerShell instructions, environment variable
names and demo accounts.

The default local database uses SQLite.

Gemini is optional and can remain disabled for a
fully functional deterministic text-order demo.

## Validation

The Build 06 verification results were:

| Verification | Result |
|---|---|
| Backend tests | 141 passed |
| Text-order evaluation | 25/25 messages |
| Expected evaluation lines | 27/27 |
| Unsafe automatic SKU selections | 0 |
| Live Gemini smoke test | Passed |
| TypeScript | Passed |
| ESLint | Passed |
| Next.js production build | Passed |

The evaluation uses a fixed synthetic dataset.
Its results do not represent measured accuracy
on unseen production retailer messages.

## Demo Workflow

1. Sign in as a demo retailer.
2. Browse products and add items to the cart.
3. Enter a text order such as:

   `2 peti washing powder 1 kilo, 5 cases biscuit 75g`

4. Review the suggested matches.
5. Confirm products and proceed to checkout.
6. Sign in as the distributor order desk.
7. Inspect and process the order.
8. Download the generated Tally XML.

The order workflow should be verified end to end
in the target demonstration environment.

## Security and Safety

- Role-protected backend operations
- Retailer-scoped order access
- Server-side input validation
- Explicit approval of AI suggestions
- Catalogue SKU validation for Gemini suggestions
- Safe AI failure fallback
- Demo OTP lockout after repeated failures
- Environment-based secret configuration

This project is a demonstration application.
Production usage requires real OTP delivery,
additional security hardening, monitoring and
deployment-specific configuration.

## Known Limitations

- Demo OTP authentication is not production SMS login.
- Photo and Hindi voice-note capture are not implemented.
- Offline salesman ordering is not implemented.
- SQLite is used for the local demo.
- TallyPrime XML import has not been verified against
  a live company configuration.
- Optional Gemini assistance requires external access.
- The 25-message evaluation is synthetic.

## Documentation

- [Local setup and deployment](deployment.md)
- [Detailed deployment and Tally notes](docs/deployment.md)
- [Implementation assumptions](docs/assumptions.md)

## Project Status

Build 06 implements the main retailer ordering,
AI-assisted capture and distributor review workflow.

The GitHub repository contains the source code.
A public live application deployment is not
claimed here.
