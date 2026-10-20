# Aatman API

Basic Express API backend. Requires Node.js 20 or newer.

```sh
npm install
npm start
```

For development with automatic restarts, run `npm run dev`.

The server listens on **http://localhost:3002**.

- `GET /api/health` — API health check

## PostgreSQL admin accounts

All database access uses PostgreSQL database **aatman**. Admin password login
is available at `POST /api/v1/auth/login`.

1. Install/start PostgreSQL and create the database once: `createdb -U postgres aatman`.
2. Set `PGHOST`, `PGPORT`, `PGDATABASE=aatman`, `PGUSER`, and `PGPASSWORD` in `.env`
   for the registration command. For `psql`, export those variables into your shell
   or use your PostgreSQL password file; `psql` does not read `.env`.
3. Run `npm run db:setup` to create both SMS authentication and admin tables.
4. Run `npm install`, then `node scripts/register-admin.js` in an interactive terminal.
   Enter email, phone with country code, name, role, and password. Choose `super_admin`
   for the first administrator. The default role is `admin`.

Registration inserts the administrator and role assignment in one transaction using
parameterized queries. Passwords are stored as salted scrypt hashes with their cost
parameters; the password is hidden during entry. This command is for trusted operators.
Keep public admin self-registration disabled. No default account or password is seeded.

The schema provides `admin_users`, `roles`, and `user_roles` (multiple roles per user).
Email and phone are unique, email is normalized to lowercase, and timestamps include
time zones. Accounts include status, verification timestamps, password-change time,
failed-login count, temporary lock expiry, and last-login time. Verification timestamps
start empty. `assigned_by` may be null for operator-created accounts.

### Admin API

Configure `BASIC_AUTH_USERNAME` and `BASIC_AUTH_PASSWORD` in `.env`.
Registration and login require HTTP Basic Auth over HTTPS in deployment.

- `POST /api/v1/auth/register`: JSON `name`, `email`, `phone` (with country code),
  `password` (12–128 characters). Creates an `admin`, not a `super_admin`.
- `POST /api/v1/auth/login`: JSON `email`, `password`. Returns `token`,
  `tokenType: "Bearer"`, `expiresIn: 28800`, and safe `user` fields.
- `GET /api/v1/auth/me`: use `Authorization: Bearer <token>`.
- `POST /api/v1/auth/logout`: same Bearer header; revokes the session, returns 204.

Login permits 20 requests per IP per 15 minutes. Five incorrect passwords lock
an account for 15 minutes. Invalid, disabled, locked, and unknown accounts return
the same 401 message. Only token hashes are stored. Sessions expire after eight
hours and are invalid after an account is disabled or its password-change timestamp
advances. Registration uses a transaction, stores scrypt hashes, and returns 409
for duplicate email or phone. Previously stored plaintext passwords are rejected;
those accounts need a trusted password reset or recreation.

Run `npm run db:setup` to add `admin_sessions` to an existing installation.
`npm test` runs unit tests; `RUN_DB_TESTS=1 node --test test/admin-login.integration.test.js`
runs HTTP/PostgreSQL tests in a temporary schema that is removed afterward.
These tests do not modify existing accounts. SMS routes remain commented out.

Role-based authorization, MFA, password reset, and email verification remain
separate work. Keep Basic Auth credentials out of browser code.

## Structure

```text
server.js              # Starts the HTTP server
src/
  app.js               # Express setup and middleware
  config/              # Application configuration
  controllers/         # Request handlers
  middlewares/         # Error handling and other middleware
  models/              # Database models
  routes/              # API route definitions
  services/            # Business logic
  utils/               # Shared helpers
```

## SMS login and PostgreSQL

1. Install/start PostgreSQL and create `aatman` as described above.
2. Copy `.env.example` to `.env` and configure the `PG*` connection variables.
   Defaults are database `aatman`, user `postgres`, host `127.0.0.1`, port `5432`.
   Use a dedicated, restricted PostgreSQL account when deploying.
3. In MSG91, create an approved **OTP** template and add its template ID and auth key
   to `.env`. Complete sender/DLT registration as required. Use a six-digit OTP template.
4. Run `npm install`, `npm run db:setup`, then `npm start`. Setup creates tables in
   the existing database; it does not create the database itself.

MSG91 API references: https://docs.msg91.com/otp and https://msg91.com/help/hello-contact-center/chatbots-in-hello/msg91-bot/utility/script-use-cases

### Try the endpoints

Replace the example phone with your own number including country code. Requesting an OTP sends a real SMS and may incur provider charges.

```sh
curl -X POST http://localhost:3002/api/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210"}'

curl -X POST http://localhost:3002/api/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+919876543210","otp":"123456"}'
```

Successful verification creates the user on first login and returns `token`, `expiresIn`, and `user`. Subsequent logins use the same phone record. No password is needed. Users are created only after successful OTP verification.

```sh
curl http://localhost:3002/api/auth/me -H 'Authorization: Bearer YOUR_TOKEN'

curl -X PATCH http://localhost:3002/api/auth/me \
  -H 'Authorization: Bearer YOUR_TOKEN' -H 'Content-Type: application/json' \
  -d '{"name":"Your Name"}'

curl -X POST http://localhost:3002/api/auth/logout -H 'Authorization: Bearer YOUR_TOKEN'
```

OTP challenges expire after five minutes, allow five verification attempts, and enforce a 60-second resend cooldown. MSG91 stores/verifies the actual OTP; this application does not store plaintext OTPs. Request and verification endpoints also have per-IP limits. Local challenge rows are locked during verification to prevent concurrent reuse. If delivery fails, request a fresh code after the cooldown. If verification succeeds at MSG91 but the database transaction fails, request a fresh code rather than retrying the consumed code.

Sessions last seven days; only SHA-256 token hashes are stored. Logout revokes the current session. Use HTTPS when deploying and store the returned token securely. IP limits use process memory; use a shared rate-limit store and configure trusted proxies explicitly if deploying multiple instances or behind a proxy. Periodically remove expired session rows.

Run `npm test` for isolated auth logic checks. Actual database connectivity and SMS delivery require your local configuration.
