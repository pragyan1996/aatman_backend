# Sports facility booking API

Node.js ES modules, Express 5 and PostgreSQL backend for staff bookings, resource availability, customer management and verified payments. Supports exclusive courts and shared-capacity facilities, timezone-aware operating hours, maintenance, temporary holds, financial/audit history, filtering and dashboards.

## Setup

Requires Node.js 22.12+ and PostgreSQL 14+ with `btree_gist` extension permission.

```sh
npm ci
cp .env.example .env
# Configure DATABASE_URL, JWT_SECRET (32+ random characters), ADMIN_EMAIL,
# ADMIN_PASSWORD (12+ characters), and MOCK_WEBHOOK_SECRET for local use.
# Create the database with your PostgreSQL administrator, for example:
createdb aatman
npm run db:migrate
npm run db:seed
npm run dev
```

Generate a secret with `openssl rand -hex 32`. No credentials are hardcoded. Seed commands never reset an existing admin password. Set SEED_DEMO=true for repeatable sample bookings/payments. PORT defaults to 3002. `npm start` starts the server and hold-expiration worker; `/api/v1/health` verifies connectivity. SIGINT/SIGTERM shuts down gracefully. Existing legacy public-schema data is preserved; legacy authentication is available at `/api/v1/legacy/auth` after its separate original setup (`npm run db:setup`). New JWT accounts live in `facility.users`.

## Tests

```sh
npm run test:unit
createdb aatman_test
TEST_DATABASE_URL=postgresql://localhost/aatman_test npm test
```

The test database name must end in `_test`. Integration tests **reset the facility schema in that database**; use a dedicated disposable database. With no TEST_DATABASE_URL, `npm test` runs unit/pure tests and explicitly skips database integration tests. It does not silently connect to the normal database for integration setup. The optional legacy HTTP suite runs separately against another dedicated test database using `RUN_DB_TESTS=1 DATABASE_URL=... npm run test:unit`; it creates/removes its own random legacy schema.

The Vitest/Supertest suite exercises login/roles/logout, customer normalization, transactional bookings, eight simultaneous exclusive requests, database exclusion enforcement, shared occupancy, concurrent shared bookings and reschedules, retry keys, cancellations, partial/full payments/refunds, signed online callbacks and duplicates, hold expiration, late captures, maintenance, validation, filters, dashboard and timezone boundaries. The original node:test unit suites are retained.

## API and design

All staff APIs use `/api/v1` with standard success/error envelopes. JWT Bearer access lasts eight hours; logout revokes its JTI. ADMIN configures sports/resources/hours/maintenance and staff; STAFF operates customers/bookings/payments. ONLINE is a booking source, not a public customer login system.

- [API reference and cURL examples](docs/api.md)
- [Database tables and migration rules](docs/database.md)
- [Architecture, locking and financial lifecycle](docs/architecture.md)
- [Importable Postman collection](docs/postman.collection.json)
- [Implementation phases](docs/implementation-plan.md)

Money is returned as decimal strings. Pricing uses the resource's hourly rate and RESOURCE/PARTICIPANT model, rounded to paise with Decimal.js. Booking creation/rescheduling checks operating hours, maintenance and maximum concurrent occupancy while holding resource locks. An exclusion constraint additionally prevents exclusive overlap. Bookings retain their historical price and are never deleted on cancellation. Refund debit records reduce net collections.

## Online payments and deployment

Local development uses an explicitly identified mock provider and signed simulated callbacks. Production requires Razorpay keys, a webhook secret and PAYMENT_PROVIDER=razorpay. See the API reference for exact callback setup. Never use mock records as real financial evidence. Real merchant credentials were unavailable; external Razorpay checkout/delivery must be validated in merchant test mode before launch.

Full refunds are supported; partial refunds require manual reconciliation. Late captures do not resurrect expired/cancelled reservations: they generate audit events requiring a provider refund. Provider refunds are initiated through the merchant dashboard, then reconciled by signed webhooks. Provider/network failures can leave orphan orders and need reconciliation. Same-day operating hours are supported; overnight shifts are outside this version. The API does not automatically transition elapsed confirmed reservations to COMPLETED.

Set exact CORS_ORIGINS, protect database credentials, terminate HTTPS at deployment infrastructure, and configure backups. Global and login rate limits are per process. Multi-instance deployments need a shared rate-limit store and an explicitly configured proxy policy. Production logs exclude payloads and secrets. Run migrations before starting the server.
