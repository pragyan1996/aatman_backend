# PostgreSQL database

Run `npm run db:migrate`. The migrator applies ordered SQL files once, stores SHA-256 checksums in `public.facility_migrations`, serializes runners with an advisory lock, and rolls back each failed migration. It never resets existing tables. The first migration requires permission to install `btree_gist`; a database administrator may install that extension first. Applied migrations are immutable; add a new numbered migration for changes.

All application tables below live in `facility`. IDs are BIGSERIAL; timestamps are TIMESTAMPTZ; prices and amounts are NUMERIC(12,2). API money is returned as decimal strings by pg. All queries use bound values; sort identifiers come from a whitelist.

| Table | Purpose and relationships |
|---|---|
| users | ADMIN/STAFF identities, bcrypt hash, active flag, unique lowercase email |
| revoked_tokens | Logged-out JWT JTI and expiry |
| sports | Configurable sports, unique name, active flag |
| resources | Sport FK, exclusive/shared type, capacity, surface, hourly price and pricing model |
| customers | Name, normalized unique E.164 phone, optional email |
| bookings | Customer/resource/creator FKs, interval, participants, frozen total, source, state, collection type, hold/cancellation data |
| payments | Booking FK, positive amount, method/state/provider, unique order and transaction references, optional unique refund-of FK |
| booking_events | Booking/actor FKs, event type, previous/new JSONB snapshots |
| resource_operating_hours | Resource FK, weekday 0=Sunday through 6=Saturday, unique per resource/day |
| resource_unavailability | Resource FK, maintenance interval and reason |
| idempotency_keys | Operation scope/key PK, payload hash, committed response |
| webhook_events | Unique verified provider event ID |
| booking_details (view) | Booking/customer/resource/sport join and aggregated net payments, balance and financial status |

Foreign keys preserve history. CHECK constraints enforce positive capacities/durations/participants, valid enumerated states, nonnegative booking totals and positive financial entries. Indexes support resource/status/time overlaps, date scans, customers, sport resources, hold expiry and booking payment/event lookups. The exclusive GiST constraint prevents overlapping HELD/CONFIRMED reservations even under concurrent transactions.

UTC instants are sent as ISO timestamps with Z or explicit offsets. Date filters and day boundaries use FACILITY_TIMEZONE, default Asia/Kolkata. Session display timezone does not change stored instants. Half-open intervals permit adjacent reservations. Closed/missing operating hours reject bookings. Default seeds use 06:00–23:00 daily.

`npm run db:seed` creates four sports, six resources and an initial ADMIN from environment configuration. It does not reset existing accounts, passwords, prices or hours. `SEED_DEMO=true` adds three idempotent sample bookings (paid, partial, online hold) on the next facility day. The online demo hold expires normally. Repeated demo seeds replay the original reservations rather than creating new ones. Pool/gym seed capacities are configurable and use participant pricing. Production seed should normally use SEED_DEMO=false.

Legacy tables in `public` are untouched by these migrations. `npm run db:setup` is the separate original legacy setup command. Back up existing databases before applying any migration. Automated integration tests reset only `facility` in an explicitly selected database whose name ends in `_test`; never reuse that database for real data.
