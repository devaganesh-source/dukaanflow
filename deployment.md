
# DukaanFlow — Deployment and Local Setup

Repository:
https://github.com/devaganesh-source/dukaanflow

## 1. Application Overview

DukaanFlow is a full-stack FMCG retailer ordering
application built with:

- Next.js 16 and React 19
- Python and FastAPI
- SQLAlchemy and SQLite
- Optional Google Gemini AI assistance

The application supports retailer and distributor
order-desk roles.

The application has been verified locally.
The source repository is available on GitHub.
A public production application deployment is
not claimed.

## 2. Prerequisites

For the documented Windows setup:

- Windows PowerShell
- Git
- Python 3.11 or newer recommended
- Node.js compatible with Next.js 16
- npm

A Gemini API key is optional.

A TallyPrime installation is not required to
run the application or generate export XML.

## 3. Clone the Repository

Open PowerShell:

```powershell
git clone https://github.com/devaganesh-source/dukaanflow.git
cd dukaanflow
```

If the project is already cloned, work from
its existing root folder.

## 4. Backend Setup

Open PowerShell in the project root:

```powershell
cd backend
```

Create a virtual environment:

```powershell
py -3 -m venv .venv
```

Install dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The backend uses SQLite by default.

When run from the `backend` directory without
a DATABASE_URL override, the database path is:

```text
backend/dukaanflow.db
```

The database file is local development data
and must not be committed.

### Configure the local demo

Set environment variables in the same
PowerShell session that starts FastAPI:

```powershell
$env:DEMO_MODE = "true"
$env:DEMO_OTP = Read-Host "Enter demo OTP"
$env:COOKIE_SECURE = "false"
$env:TEXT_ORDER_AI_ENABLED = "false"

$env:SESSION_SECRET = (
    & .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
).Trim()
```

Use the demo OTP listed in Section 7.

The session secret is generated randomly
rather than stored in source code.

DEMO_MODE is used only for a demonstration.
COOKIE_SECURE is false only for local HTTP.

For local SQLite, DATABASE_URL can be left
unset to use the default configured in
`backend/app/database.py`.

### Start FastAPI

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Check the health endpoint:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok"}
```

API documentation, when enabled:

```text
http://127.0.0.1:8000/api/docs
```

Keep this terminal open.

## 5. Frontend Setup

Open a second PowerShell terminal:

```powershell
cd dukaanflow/frontend
```

If your terminal already starts inside
the repository root, use:

```powershell
cd frontend
```

Install locked dependencies:

```powershell
npm ci
```

Configure the server-side FastAPI origin:

```powershell
$env:API_ORIGIN = "http://127.0.0.1:8000"
```

Start Next.js:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

The browser communicates with Next.js.
The frontend API routes forward authenticated
requests to FastAPI.

Keep the backend terminal running while
using the frontend.

## 6. Environment Variables

The following are the environment variable
names used by the project. Secret values
must be configured locally or through
deployment platform secret settings.

### Backend

| Name | Purpose |
|---|---|
| DATABASE_URL | SQLAlchemy database connection |
| DEMO_MODE | Enables the demo authentication flow |
| DEMO_OTP | Fixed OTP for local demonstration |
| SESSION_SECRET | Secret for authenticated sessions |
| COOKIE_SECURE | Secure cookie configuration |
| TEXT_ORDER_AI_ENABLED | Enable optional Gemini assistance |
| GEMINI_API_KEY | Google Gemini API credential |
| TALLY_UNIT_NAME | Unit name in exported Tally XML |
| TALLY_SALES_LEDGER | Sales ledger used by XML export |
| TALLY_DISCOUNT_LEDGER | Scheme discount ledger used by XML export |

### Frontend

| Name | Purpose |
|---|---|
| API_ORIGIN | Server-side FastAPI API origin |

The example environment files are located at:

- `backend/.env.example`
- `frontend/.env.example`

Never commit credentials, real `.env` files
or session secrets.

Do not expose SESSION_SECRET, DEMO_OTP
or GEMINI_API_KEY using NEXT_PUBLIC_
environment variables.

The example files are templates.
Environment variables must be loaded into
the running processes as shown above.

## 7. Demo Login Details

Use these fictional demonstration accounts:

| Role | Demo phone |
|---|---|
| Retailer | 9000000001 |
| Distributor order desk | 9000000002 |

Local demonstration OTP:

```text
654321
```

This OTP is for demo mode only.
It is not a real SMS verification code.

The application does not return the demo
OTP through an API response.

Five incorrect OTP attempts can lock a
demo account for ten minutes.

Wait for the lockout to expire and request
a new OTP if this happens.

## 8. Retailer Demo

Open the application at:

```text
http://localhost:3000
```

Sign in using the retailer demo account.

Verify:

1. The product catalogue loads.
2. Search and category filtering work.
3. Products display stock and schemes.
4. Cart quantities can be changed.
5. Checkout creates an order.
6. The order is visible in retailer order history.

### AI-assisted message ordering

Enter:

```text
2 peti washing powder 1 kilo, 5 cases biscuit 75g
```

Select Analyze Order.

The application should return catalogue
matches and case quantities for retailer
review.

The retailer can correct or skip suggestions.

Only confirmed items are added to the cart.

The retailer must separately confirm
checkout before an order is placed.

## 9. Optional Gemini AI Assistance

The application works without a Gemini key.

When disabled, the deterministic parser
still recognizes supported product names,
SKUs, pack sizes and case units.

To enable Gemini for local testing,
configure these environment variable names
in the backend process:

- TEXT_ORDER_AI_ENABLED
- GEMINI_API_KEY

Restart the backend after changing its
environment configuration.

Gemini is used for unresolved product matches.

Gemini responses are validated against
catalogue SKUs and parsed case quantities.

A model failure does not block manual
retailer ordering.

Do not send real customer information to a
development AI account without appropriate
data protection and authorization.

### Live AI smoke test

From `backend`, with a valid API key
configured privately:

```powershell
.\.venv\Scripts\python.exe -m evaluation.smoke_gemini
```

The test uses synthetic catalogue data
and does not create an order.

## 10. Distributor Demo

Sign out of the retailer account.

Sign in using the distributor order-desk
demo phone number.

Verify:

1. The distributor order queue loads.
2. The submitted retailer order is visible.
3. Order details and status history can be viewed.
4. Supported order status actions can be performed.
5. Credit holds can be reviewed and released.
6. Tally Sales Order XML can be exported.

Role-based API permissions prevent
retailers from using distributor-only
order-management operations.

## 11. Tally Sales Order XML

DukaanFlow exports a stored order as
Tally Sales Order XML.

The export contains order identification,
retailer party information, product SKUs,
case quantities, scheme discount details
and order totals.

Tally configuration may require matching:

- Party ledger names
- Stock item names
- Case units
- Sales ledger
- Discount ledger

The export functionality has automated tests.

Import into a live TallyPrime installation
has not been verified.

Generated XML should be checked against
the target Tally company before use.

A generated export is not proof of a
successful TallyPrime import.

Detailed integration notes are available in:

```text
docs/deployment.md
```

## 12. Testing

### Backend

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Build 06 result: 141 tests passed.

### Deterministic parser evaluation

```powershell
.\.venv\Scripts\python.exe -m evaluation.text_order_eval
```

Build 06 evaluation results:

- 25/25 messages passed
- 27/27 expected lines matched
- Zero unsafe automatic SKU selections

The evaluation uses synthetic examples.
These results are not a claim of
production AI accuracy.

### Frontend

From `frontend`:

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

All three checks passed during Build 06
verification.

## 13. Production Deployment Status

The application source is published on GitHub.

No public live deployment URL is provided
as part of the current verified setup.

The documented and tested execution path
uses two local processes:

- Next.js frontend
- FastAPI backend with SQLite

For a future hosted deployment, the
frontend and API must be configured with
their correct origins, persistent data
storage and production secrets.

SQLite data stored on an ephemeral
hosting filesystem may be lost when
the service restarts or is redeployed.

Production deployment also requires:

- HTTPS and secure cookies
- A strong unique session secret
- A real OTP delivery provider
- Persistent database storage and backups
- Database migrations
- Rate limiting and monitoring
- CSRF protection review
- Access-control verification
- Reverse-proxy and cookie configuration
- Appropriate secret management

DEMO_MODE must not be enabled for real
customer authentication.

Free-tier hosting services may experience
cold starts or sleeping instances.

No production performance or availability
guarantees are claimed.

## 14. Troubleshooting

### Frontend cannot load catalogue

Check that FastAPI is running and
API_ORIGIN points to the correct backend.

Restart Next.js after changing API_ORIGIN.

### Login fails

Check that DEMO_MODE is enabled and
DEMO_OTP was configured before FastAPI
started.

Check whether the demo account is
temporarily locked.

### Database errors

Check DATABASE_URL and confirm that the
process can write to its SQLite directory.

Start FastAPI from the intended backend
working directory.

### Gemini connection fails

Disable optional AI assistance and use
the deterministic parser.

Verify external HTTPS connectivity,
the API key, the model and provider quota
before enabling Gemini again.

### Tally import fails

Check that ledger names, stock items and
units match the target Tally company.

Do not repeatedly import the same order
without checking for duplicate vouchers.

## 15. Known Limitations

- Real SMS OTP delivery is not implemented.
- Photo and voice-note capture are not implemented.
- Offline salesman ordering is not implemented.
- Local SQLite is not a scaled production database.
- Real-world AI matching accuracy is not measured.
- TallyPrime import compatibility needs live testing.
- A public application deployment is not verified.

These limitations are documented rather
than represented as completed features.
