# VGU Pulse (`vgu-pulse-next`) — Stage 2 Hardened Full-Stack Codebase

Student-first utility toolkit, structured collaboration request board, and campus event discovery for **Vivekananda Global University (VGU), Jaipur**.

## Architecture & Security Guarantees
- **Frontend:** React 18, TypeScript, Tailwind CSS v4, Vite 6
- **Backend API & Edge HTMLRewriter:** Cloudflare Workers (`src/worker/index.ts`)
- **Database & Migrations:** Cloudflare D1 SQLite (`migrations/0001_initial_schema.sql`, `migrations/0002_seed_verified_events.sql`, `migrations/0003_stage2_hardening.sql`)
- **Hardened Security & Concurrency Model:**
  - **AES-256-GCM Encryption at Rest:** Private `coordinationNote` values are encrypted via Web Crypto (`AES-GCM`, 256-bit key derived from `COORDINATION_ENCRYPTION_KEY`, random 96-bit IV per record) before being written to D1. Plaintext notes are never stored in new records, never returned in public card APIs or OpenGraph metadata, and only decrypted for authorized handshake participants after explicit owner acceptance.
  - **Atomic Handshake Capacity & Lifecycle Transitions:** Uses conditional SQL updates inside `db.batch()` to prevent double-decrementing, overbooking the last available spot under concurrent acceptances, or leaving capacity out of sync when an accepted handshake is later declined/cancelled.
  - **Idempotent Event Participation & Report Deduplication:** Event buddy counts (`event_participations`) and card reports (`card_reports`) use primary-key uniqueness constraints on hashed capability/reporter identifiers so repeated clicks cannot inflate counters.
  - **True Sliding-Window Rate Limiting:** Uses `rate_limit_events` in D1 over a rolling 3,600-second window (`create_card`: 5/hr, `create_handshake`: 15/hr, `report_card`: 10/hr, `event_buddy`: 30/hr) with automatic pruning of expired entries.
  - **Fail-Closed Production Secrets:** When `APP_ENV="production"`, missing or placeholder values for `TURNSTILE_SECRET_KEY`, `COORDINATION_ENCRYPTION_KEY`, or `RATE_LIMIT_SALT` cause write endpoints to fail closed (`503 Service Unavailable`).

---

## Environment Variables & Secrets Reference

| Variable | Where Configured | Required Locally? | Required in Production? | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `APP_ENV` | `wrangler.jsonc` / `.dev.vars` | Optional (`development`) | **Yes (`production`)** | Enforces fail-closed checks on Turnstile, encryption keys, and salts. |
| `PUBLIC_ORIGIN` | `wrangler.jsonc` / `.dev.vars` | Optional (`http://localhost:5173`) | **Yes** | Canonical origin for CORS mutation checks and OpenGraph metadata URLs. |
| `TURNSTILE_SITE_KEY` | `wrangler.jsonc` | Uses Cloudflare dummy test key | **Yes** | Public Turnstile site key. |
| `TURNSTILE_SECRET_KEY` | `.dev.vars` / `wrangler secret put` | Optional in dev | **Yes (Fail-Closed)** | Server-side secret validated against Cloudflare Turnstile `siteverify`. |
| `COORDINATION_ENCRYPTION_KEY` | `.dev.vars` / `wrangler secret put` | Uses dev key in `.dev.vars` | **Yes (≥32 chars, Fail-Closed)** | Master secret for AES-256-GCM encryption of private coordination notes. |
| `RATE_LIMIT_SALT` | `.dev.vars` / `wrangler secret put` | Uses dev salt in `.dev.vars` | **Yes (≥16 chars, Fail-Closed)** | Secret salt for hashing client IPs in sliding-window rate limits and report deduplication. |

---

## Local Verification & Migration Commands (Fedora Linux)
