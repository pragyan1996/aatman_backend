# Aatman API

Basic Express API backend. Requires Node.js 20 or newer.

```sh
npm install
npm start
```

For development with automatic restarts, run `npm run dev`.

The server listens on **http://localhost:3002**.

- `GET /api/health` — API health check

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
