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
is not yet exposed as an API endpoint.

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

For the login implementation, add:

- Password verification with constant-time hash comparison, generic failure messages,
  per-IP/account rate limits, and temporary lockouts.
- MFA for administrators, preferably passkeys or authenticator codes.
- Revocable sessions with hashed random tokens, expiry, logout, and secure HttpOnly cookies.
- Password reset and email verification using expiring, single-use, hashed tokens.
- Permission checks on every protected endpoint, plus an audit log for login events,
  account changes, and role changes. Seeded roles alone do not enforce permissions.

The tracking columns support these features; the scripts do not implement them yet.

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
