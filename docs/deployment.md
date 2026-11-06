
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
