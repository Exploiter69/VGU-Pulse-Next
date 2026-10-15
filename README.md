# VGU Pulse (`vgu-pulse-next`) — Stage 2 Full-Stack Codebase

Student-first utility toolkit, structured collaboration request board, and campus event discovery for **Vivekananda Global University (VGU), Jaipur**.

## Architecture Overview
- **Frontend:** React 18, TypeScript, Tailwind CSS v4, Vite 6
- **Backend API & Edge HTMLRewriter:** Cloudflare Workers (`src/worker/index.ts`)
- **Database:** Cloudflare D1 SQLite (`migrations/0001_initial_schema.sql`, `migrations/0002_seed_verified_events.sql`)
- **Privacy & Security Model:**
  - **Local-First Toolkit:** Attendance calculations, SGPA/CGPA estimations, and semester planner tasks stay 100% in browser `localStorage` and work offline without any account.
  - **Capability-Token Ownership:** Publishing a card or sending a handshake returns a 256-bit cryptographic capability token stored in your browser vault; only its SHA-256 hash is stored in D1.
  - **Private Coordination Handoff:** Public cards block phone numbers and email addresses. A creator's `coordinationNote` is stored privately in D1 and revealed **only** to a requester whose handshake is explicitly accepted by the card owner.
  - **Fail-Closed Verification:** Production requires a valid Cloudflare Turnstile secret key (`TURNSTILE_SECRET_KEY`); if unconfigured in `APP_ENV="production"`, write endpoints fail closed (`503`).

---

## Environment Variables Reference

| Variable | Where Configured | Required Locally? | Required in Production? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `APP_ENV` | `wrangler.jsonc` / `.dev.vars` | Optional (defaults to `development`) | **Yes (`production`)** | Controls fail-closed Turnstile enforcement. |
| `PUBLIC_ORIGIN` | `wrangler.jsonc` / `.dev.vars` | Optional (`http://localhost:5173`) | **Yes** | Canonical base URL for OpenGraph `/cards/:id` and `/events/:id` metadata. |
| `TURNSTILE_SITE_KEY` | `wrangler.jsonc` | Uses Cloudflare dummy test key by default | **Yes** | Public Turnstile widget site key. |
| `TURNSTILE_SECRET_KEY` | `.dev.vars` (local) / `wrangler secret put` (prod) | Optional (uses dummy test key) | **Yes (Fail-Closed)** | Server-side secret key validated against Cloudflare Turnstile `siteverify`. |
| `RATE_LIMIT_SALT` | `.dev.vars` / `wrangler secret put` | Optional | **Yes** | Secret salt used when SHA-256 hashing client IPs for hourly D1 rate limiting. |

---

## Local Development Workflow (Fedora Linux / Node.js)

```bash
# 1. Install patched dependencies
npm install

# 2. Create your local Worker environment file from the template
cp .dev.vars.example .dev.vars

# 3. Apply the numbered D1 SQLite migrations to your local Miniflare database
npm run db:migrate:local

# 4. Run strict TypeScript typecheck
npm run check

# 5. Run the Vitest unit & Worker API behavior test suite
npm test

# 6. Run security audit check
npm audit

# 7. Start the integrated Vite + Cloudflare Worker + Local D1 server
npm run dev

```

---

## Production Cloudflare D1 Provisioning & Deployment (When Ready)

Do **not** run these until you have reviewed the Stage 2 branch locally and want to provision a live Cloudflare Worker + D1 database on your free Cloudflare account:

```bash
# 1. Authenticate Wrangler with your Cloudflare account
npx wrangler login

# 2. Create the production D1 database
npx wrangler d1 create vgu-pulse-db
# Copy the returned `database_id` UUID into `wrangler.jsonc` under `d1_databases[0].database_id`

# 3. Apply migrations to the remote D1 database
npm run db:migrate:remote

# 4. Configure production secrets
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put RATE_LIMIT_SALT

# 5. Set APP_ENV="production" and PUBLIC_ORIGIN in wrangler.jsonc, then dry-run & deploy
npm run cf:dry-run
npx wrangler deploy

```

