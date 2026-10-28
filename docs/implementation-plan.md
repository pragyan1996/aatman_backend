# Implementation plan
1. Foundation: preserve legacy authentication, add isolated `facility` schema and versioned additive migrations, JWT staff authentication, validated facility/customer management.
2. Booking engine: serialize resource writers, exclusion constraint for exclusive bookings, occupancy sweep for shared bookings, audit events, retry keys, cancellation/rescheduling.
3. Payments/dashboard: locked financial operations, net collections, filters, summaries, schedule and timezone-aware slots.
4. Hardening: verified provider callbacks, expiring holds, isolated PostgreSQL integration tests, operational documentation and startup verification.

## Execution results

All four phases are implemented. The new API has validation/controller/service/repository layers; configuration entities share one facility module. Verification used isolated temporary PostgreSQL development and `_test` databases, without resetting existing application data.

- Migrations applied successfully; checksum validation and repeat invocation succeeded.
- Repeatable seeds produced four sports, six resources, three demo bookings and two desk payment records.
- 20 Vitest/Supertest and pure-rule tests passed, including real PostgreSQL concurrent requests and exclusion enforcement.
- 12 original test checks passed with the optional legacy HTTP suite enabled in its random isolated schema.
- Actual Express startup, database health response and SIGTERM shutdown succeeded.
- npm dependency audit reported zero known vulnerabilities after compatible updates.
- Importable Postman JSON and git whitespace checks passed.

External Razorpay merchant checkout and delivery cannot be validated without credentials. The implemented provider calls Razorpay orders and verifies signed webhook captures/refunds; local mock behavior is explicitly labeled and rejected in production. Operational boundaries (full refunds only, same-day hours, provider-dashboard refund initiation, reconciliation of late/orphan orders) are documented in architecture.md and api.md.
