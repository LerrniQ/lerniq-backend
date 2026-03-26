# LerniQ API

Express + TypeScript REST API for the LerniQ platform. Handles waitlist signups, course rep registration, referral tracking, Typeform webhooks, and admin authentication.

## Tech stack

- Node.js + Express + TypeScript
- PostgreSQL (`pg`)
- Zod (validation)
- bcryptjs + jsonwebtoken (admin auth)
- Docker + Docker Compose

## Endpoints

### Public

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/signup` | Waitlist signup — returns a referral link |
| `POST` | `/course-rep` | Course rep registration — returns a Typeform lecturer link |
| `POST` | `/auth/login` | Admin login — returns a JWT |
| `POST` | `/webhook/typeform` | Typeform webhook — increments referral count on lecturer survey submission |
| `GET` | `/referrals/:refId` | Get referral stats for a given ref ID |

### Admin (requires `Authorization: Bearer <token>`)

| Method | Route | Description |
|---|---|---|
| `GET` | `/admin/waitlist` | All waitlist signups |
| `GET` | `/admin/course-reps` | All course reps sorted by referral count |

## Getting started

### Prerequisites

- Node.js 20+
- PostgreSQL (or Docker)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/lerniq
PORT=3000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
JWT_SECRET=change-this-to-a-long-random-string
ADMIN_PASSWORD=Admin@Lerniq2024!
```

### 3. Set up the database

Run the schema against your PostgreSQL instance:

```bash
psql "your-connection-string" -f schema.sql
```

### 4. Run the dev server

```bash
npm run dev
```

The API runs at `http://localhost:3000`.

On first boot, the admin user (`admin@lerniq.org`) is seeded automatically using `ADMIN_PASSWORD`.

## Running with Docker

Spins up the API and a local PostgreSQL instance together. No separate database setup needed — the schema is applied automatically.

```bash
docker compose up --build
```

The API is at `http://localhost:3000`. PostgreSQL is accessible at `localhost:5433` (host port remapped to avoid conflicts with a local Postgres on 5432).

To wipe the database and start fresh:

```bash
docker compose down -v && docker compose up --build
```

## Building for production

```bash
npm run build   # compiles TypeScript to dist/
npm start       # runs dist/index.js
```

## Typeform setup

1. Open your lecturer survey form in Typeform
2. Add a **hidden field** named exactly `ref`
3. Configure a webhook pointing to:
   ```
   POST https://your-api.onrender.com/webhook/typeform
   ```
4. When a lecturer submits using a link like `?ref=LNQ-XXXXX`, the course rep's referral count increments automatically

## Deployment (Render)

1. Push to GitHub
2. Create a new **Web Service** on Render:
   - Environment: `Node`
   - Build command: `npm install && npm run build`
   - Start command: `node dist/index.js`
3. Create a **PostgreSQL** instance on Render and copy the connection string
4. Set environment variables in the Render dashboard (see `.env.example`)
5. Run `schema.sql` against your Render Postgres once via the Render shell or psql

Alternatively, set the Render environment to **Docker** and point it at the `Dockerfile` — Render will handle the rest.

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | Port the server listens on (Render sets this automatically) |
| `FRONTEND_URL` | Allowed CORS origin in production |
| `NODE_ENV` | `development` or `production` |
| `JWT_SECRET` | Secret used to sign admin JWTs — use a long random string in production |
| `ADMIN_PASSWORD` | Password for the seeded `admin@lerniq.org` account |
