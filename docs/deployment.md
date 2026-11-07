
# DukaanFlow — Deployment Notes

## Environment variables

Backend:
- DATABASE_URL: Database connection URL
- DEMO_MODE: Enables local demo accounts when true
- DEMO_OTP: Fixed six-digit OTP for local demonstrations
- SESSION_SECRET: Random secret, minimum 32 characters
- COOKIE_SECURE: Must be true under production HTTPS

Frontend:
- API_ORIGIN: Server-side FastAPI origin

Never expose SESSION_SECRET or DEMO_OTP through
NEXT_PUBLIC_ environment variables.

## Local demonstration

Start the backend with:

DEMO_MODE=true
DEMO_OTP=654321
COOKIE_SECURE=false

Provide a randomly generated SESSION_SECRET.

Demo retailer: 9000000001
Demo order desk: 9000000002

The fixed OTP is communicated out of band and
is never returned by an API response.

## Demo account lockout

Five incorrect OTP attempts lock the account
for ten minutes.

The lockout expires automatically. After it
expires, request a new OTP.

For local development, an authorized developer
may clear the locked account's OTPChallenge
record directly in the development database
and request a new OTP.

Do not expose an unauthenticated unlock API.

## Production configuration

- DEMO_MODE=false
- COOKIE_SECURE=true
- Configure HTTPS
- Use a strong SESSION_SECRET
- Use a persistent production database
- Configure the deployed API_ORIGIN
- Disable or protect developer-only API documentation
- Configure a real OTP delivery provider before
  enabling non-demo login

The current demo OTP implementation is not a
production SMS authentication solution.

## Remaining deployment work

Before public deployment:
- Add a real OTP provider
- Add request/IP rate limiting and monitoring
- Configure schema migrations
- Add CSRF defenses for order-changing operations
- Review reverse-proxy origin handling
- Configure production secrets and backups
- Verify role authorization and session expiry
- Verify no sensitive information appears in logs

## TallyPrime XML export

DukaanFlow exports saved retailer orders as
Sales Order XML files.

A distributor staff member can export a submitted
order and download the generated XML.

A successful generation changes the order to
"exported" and creates a status audit event.

The original XML is saved for repeat downloads.

"Exported" does not mean TallyPrime has imported
or accepted the file.

### Tally prerequisites

Before importing, configure these TallyPrime
masters to match the generated XML:

- Party ledger matching the retailer name
- Stock item names matching DukaanFlow SKUs
- Unit of measurement matching TALLY_UNIT_NAME
- Sales ledger matching TALLY_SALES_LEDGER
- Discount ledger matching TALLY_DISCOUNT_LEDGER

Default demo names:
- Unit: CASE
- Sales ledger: Sales
- Discount ledger: Scheme Discounts

The exported Sales Order contains:
- Stable DukaanFlow order reference
- Retailer party ledger name
- Original paid-case prices
- Actual quantities including free cases
- Billed quantities excluding free cases
- Total scheme discount
- Net order value

GST is excluded. No sales invoice, GST calculation
or payment confirmation is generated.

### Import procedure

1. Open the intended company in TallyPrime.
2. Ensure the required masters exist.
3. Back up company data.
4. Use Alt+O > Import > Transactions.
5. Select the generated XML file.
6. Review the import result and any errors.
7. Compare the imported order's quantities and
   total with the DukaanFlow order receipt.

### Integration limitations

XML generation is covered by automated tests.

Actual TallyPrime import compatibility must be
verified with the target company's configuration.

The current exporter assumes SKU-based stock
master names and case-based quantities.

Free quantities and discounts may require
company-specific import mapping adjustments.

Re-importing the same XML may create duplicate
vouchers depending on TallyPrime's configuration.
Do not re-import without checking existing orders.
