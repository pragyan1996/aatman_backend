# API reference

Base: `/api/v1`. JSON requests and responses. Protected endpoints require `Authorization: Bearer <JWT>`. ADMIN can also perform all STAFF operations. Success: `{ "success": true, "message": "Success", "data": ... }`. Errors: `{ "success": false, "message": "...", "error": { "code": "..." } }`. Validation returns 400, missing authentication 401, insufficient role 403, missing record 404, conflicts 409, business rules 422, rate limits 429. Responses never include credential hashes. Dates are YYYY-MM-DD in the facility timezone; instants require ISO 8601 with offset/Z. Money input is a JSON number with at most two decimals; output is a decimal string.

## Authentication and staff

| Method/path | Access | Request/behavior |
|---|---|---|
| POST /auth/login | Public, rate limited | `{email,password}` → token, token_type, expires_in, user |
| GET /auth/me | Staff | Current safe user profile |
| POST /auth/logout | Staff | Immediately revokes this JWT JTI, returns 200 |
| GET /auth/users | Admin | List staff safe profiles |
| POST /auth/users | Admin | `{name,email,password,role}`; role ADMIN/STAFF, password 12–72 characters, at most 72 UTF-8 bytes |
| PATCH /auth/users/:id | Admin | `{role?,is_active?}` |

Login JWTs expire after 8 hours. There is no refresh token: log in again. Logout invalidates only this token. Disabling a user invalidates all access immediately. Initial admin is created only through the environment seed command. The original Basic Auth/session routes are preserved under `/legacy/auth`; they have their original response shapes and are separate accounts.

## Facility and customers

| Method/path | Access | Request/behavior |
|---|---|---|
| GET /sports | Staff | Sports list |
| POST /sports | Admin | `{name,description?,is_active?}` |
| GET /sports/:id | Staff | Sport detail |
| PATCH /sports/:id | Admin | Partial sport fields |
| GET /resources | Staff | Resource list; sport_id, is_active filters |
| POST /resources | Admin | `{sport_id,name,surface_type?,capacity,booking_type,price_per_hour,pricing_model?,is_active?}` |
| GET /resources/:id | Staff | Resource detail |
| PATCH /resources/:id | Admin | Partial resource fields |
| GET /resources/:id/operating-hours | Staff | All configured weekdays |
| PUT /resources/:id/operating-hours | Admin | `{hours:[{day_of_week,opening_time,closing_time,is_closed}]}` exactly 7 unique weekdays |
| GET /resources/:id/unavailability | Staff | Maintenance periods |
| POST /resources/:id/unavailability | Admin | `{start_at,end_at,reason}` |
| GET /customers | Staff | Customer list with search by name/phone |
| POST /customers | Staff | `{full_name,phone,email?}` |
| GET /customers/:id | Staff | Customer detail |
| PATCH /customers/:id | Staff | Partial customer fields |

All lists above accept search, page (default 1), limit (default 25, max 100). List data is `{items,pagination:{page,limit,total,pages}}`. Resource booking_type is EXCLUSIVE/SHARED. pricing_model is RESOURCE (default) or PARTICIPANT. Local 10-digit customer phones normalize with +91; other numbers must have a country code. Normalized duplicates return 409. Quick bookings reuse matching customers without silently overwriting their names.

## Bookings

| Method/path | Behavior |
|---|---|
| POST /bookings | Create, 201; supports Idempotency-Key |
| GET /bookings | Filtered joined list with pagination |
| GET /bookings/:id | Detail including customer/resource/sport and financial summary |
| PATCH /bookings/:id | `{notes}` only |
| PATCH /bookings/:id/cancel | `{reason}`; retained booking and payments |
| PATCH /bookings/:id/reschedule | `{start_at,end_at,resource_id?}`; transactionally repriced; pending online payments must be resolved first |
| GET /bookings/:id/events | Audit history |
| GET /bookings/summary?date=YYYY-MM-DD | Dashboard aggregate; date defaults to today |

All require STAFF. Creation accepts either `customer:{name,phone,email?}` or `customer_id`, plus `resource_id,start_at,end_at,participants` (default 1), `booking_source` (DESK/ONLINE, default DESK), `payment_option` (PAY_AT_DESK/PAY_ONLINE, default PAY_AT_DESK), optional notes. Caller-supplied amount/status is rejected. Desk collection confirms without claiming payment. Online collection creates a hold for positive totals (zero-price reservations confirm immediately); a verified full capture confirms it. Intervals must fit a single operating day, start on the configured slot grid, last a multiple of the slot interval and not exceed 24 hours. Start must be in the future.

GET /bookings supports date, date_from (inclusive), date_to (inclusive), tab (TODAY/UPCOMING/PAST), sport_id, resource_id, source, payment_status (PAID/PARTIAL/UNPAID), booking_status (HELD/CONFIRMED/CANCELLED/EXPIRED/COMPLETED), search (customer name/phone/code), sort (start_at/created_at/total_amount), sort_order (asc/desc), page and limit. UPCOMING includes active bookings whose end is in the future; summary upcoming_bookings counts future starts. PAST uses end <= now. Date filters use start time. Bookings are not automatically marked COMPLETED; elapsed confirmed bookings appear in PAST and retain history.

Summary data: `{date,total_bookings,paid,collect_at_desk,payment_pending_online,upcoming_bookings}`. total_bookings counts CONFIRMED only. paid and collect_at_desk count confirmed bookings, with full payment taking precedence. payment_pending_online also counts live online holds, so it can exceed the confirmed-only denominator. Partial balances fall into the relevant collection category. Cancelled/expired/completed are excluded from active counts.

## Availability

| Method/path | Query/response |
|---|---|
| GET /availability | date required; sport_id/resource_id optional, duration_minutes default 60, participants default 1 |
| GET /schedule | date required; sport_id/resource_id optional |

STAFF only. Availability returns `{date,timezone,resources:[{resource,slots:[{start_at,end_at,remaining_capacity,available}]}]}`. Only active resources/sports appear; past slots are unavailable. Duration must be a multiple of the configured interval. Schedule returns `{date,timezone,resources:[{resource,bookings:[]}]} ` including confirmed, completed and unexpired held bookings that overlap the facility day.

## Payments

| Method/path | Access | Request/behavior |
|---|---|---|
| POST /bookings/:id/payments | Staff | `{amount,method,transaction_reference?}`; CASH/UPI/CARD; 201 |
| GET /bookings/:id/payments | Staff | All credit/refund records |
| POST /bookings/:id/refunds | Admin | `{payment_id,transaction_reference}`; full desk refund, 201 |
| POST /payments/online | Staff | `{booking_id}`; creates/reuses pending INR provider order, 201 |
| POST /webhooks/payments | Signed public callback | Raw signed provider JSON |

Mutation requests accept Idempotency-Key. Payments cannot exceed net outstanding balance. Desk collection requires CONFIRMED and collection type DESK. Online order creation requires HELD/CONFIRMED and ONLINE collection. Only verified captured events mark online payments SUCCESS. Payment failure leaves the hold until expiry/retry. Duplicate callbacks are safe. Desk refunds create separate REFUNDED debits; original successful credits remain unchanged. Online refunds are initiated in the provider dashboard, then reconciled through signed full-refund events. Partial provider refunds are rejected for manual reconciliation.

### Razorpay setup

Set PAYMENT_PROVIDER=razorpay, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, JWT_SECRET and NODE_ENV=production. Configure the merchant dashboard webhook URL as `https://<host>/api/v1/webhooks/payments` and subscribe to payment.captured, payment.failed and refund.processed. Use its configured webhook secret (not the API key secret). Verification is HMAC-SHA256 of the exact raw request body against X-Razorpay-Signature; X-Razorpay-Event-Id identifies deliveries. Checkout uses the returned provider_order_id and public provider_key. The API does not accept frontend success claims. Use test-mode keys and a real gateway delivery to validate merchant configuration before live use. Razorpay credentials were not supplied during implementation, so real merchant checkout/webhook delivery has not been exercised.

### Local mock

PAYMENT_PROVIDER=mock is development-only. Set MOCK_WEBHOOK_SECRET. Online initiation returns a `mock_order_...` order and mock:true; this is never a real payment. Send provider-shaped event JSON with X-Mock-Signature (hex HMAC-SHA256 of exact bytes) and X-Mock-Event-Id. Supported payloads: payment.captured/payment.failed with `payload.payment.entity:{id,order_id,amount,currency:"INR"}`; refund.processed with `payload.refund.entity:{id,payment_id,amount}`. Amount is integer paise. Production startup rejects mock providers. Unknown event types are acknowledged and ignored after signature verification.

Late captures for expired/cancelled bookings return requires_refund:true, preserve booking status and record an audit event. Reconcile these promptly through provider refunds. Unknown order events, wrong amounts and unsupported partial refunds return an error for operator investigation.

## cURL examples

```sh
curl -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"your-configured-password"}'

curl "$BASE/api/v1/resources" -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE/api/v1/bookings" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: reception-unique-request-1' \
  -d '{"customer":{"name":"Rohan Kulkarni","phone":"9822041210"},"resource_id":1,"start_at":"2026-12-24T00:30:00Z","end_at":"2026-12-24T01:30:00Z","participants":1,"booking_source":"DESK","payment_option":"PAY_AT_DESK"}'

curl "$BASE/api/v1/bookings?date=2026-12-24&source=DESK&page=1&limit=25" \
  -H "Authorization: Bearer $TOKEN"
curl "$BASE/api/v1/bookings/summary?date=2026-12-24" -H "Authorization: Bearer $TOKEN"
curl "$BASE/api/v1/availability?date=2026-12-24&duration_minutes=60" -H "Authorization: Bearer $TOKEN"
curl "$BASE/api/v1/schedule?date=2026-12-24" -H "Authorization: Bearer $TOKEN"

curl -X POST "$BASE/api/v1/bookings/1/payments" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: desk-payment-1' \
  -d '{"amount":200,"method":"UPI","transaction_reference":"unique-bank-reference"}'
curl -X PATCH "$BASE/api/v1/bookings/1/reschedule" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"start_at":"2026-12-25T00:30:00Z","end_at":"2026-12-25T01:30:00Z"}'
curl -X PATCH "$BASE/api/v1/bookings/1/cancel" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"reason":"Customer request"}'
curl -X POST "$BASE/api/v1/payments/online" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: online-order-1' -d '{"booking_id":2}'
```

GET /health checks PostgreSQL connectivity and returns `{status:"ok"}` in the standard envelope. Each request returns X-Request-ID for tracing.
