# Themis — Adjuster AI

Turn damage photos + a policy PDF into a structured loss-report draft.

- **Client:** React + Vite + Tailwind v4 (repo root, builds to `dist/`)
- **API:** Node + Express (`server/`) — owns the OpenAI key, transactional email, and Postgres

The browser never talks to OpenAI directly; all AI calls go through our API so the
`OPENAI_API_KEY` is never shipped to the client.

## Structure

```
.                # React client + Vite config
  src/           # components, lib/api.js, lib/ai.js, lib/pdf.js, lib/sample.js
  server/        # Express API (magic-link sessions, local + OpenAI engines)
    src/
      index.js   # boots db + server + mail worker + Telegram poll
      app.js     # routes: /api/health /api/beta /api/analyze /api/report /api/ask /api/admin/*
      db.js      # pg pool + schema (beta_leads, telegram_pairs), in-memory fallback
      email.js   # Resend adapter + admin notification (templates live in templates.js)
      mailer.js  # own SMTP client (stdlib): Gmail relay, no verified domain needed
      queue.js   # mail task queue: retries, dead-letter, caps, breaker, sweeps
      templates.js # EN/BM mail templates (single source of truth)
      send.js    # provider dispatcher: Telegram → SMTP → Resend → file log
      telegram.js # Telegram pairing + delivery (bot token only, no domain)
      openai.js  # vision analyze + report generation (opt-in via AI_PROVIDER)
      engine.js  # deterministic local engine (default, zero AI bills)
      config.js  # env loading + central mail/channel knobs
```

## Local development

Two processes: the API and the Vite dev server.

```bash
# terminal 1 — API
cd server
cp .env.example .env      # fill in keys, or leave DATABASE_URL blank (memory store)
npm install
npm run dev               # http://localhost:8787

# terminal 2 — client
cp .env.example .env.local   # sets VITE_API_URL=http://localhost:8787
npm install
npm run dev                  # http://localhost:5173
```

## Environment variables

Client (root `.env.local`, **public**): `VITE_API_URL` (only if API is a different origin).

Server (`server/.env`, **secret**):

| Var | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | server-side OpenAI key (only used when `AI_PROVIDER=openai`) |
| `AI_PROVIDER` | `local` (default, zero bills) or `openai` |
| `RESEND_API_KEY` | Resend fallback sender (test domain reaches owner inbox only) |
| `RESEND_FROM` | e.g. `Themis <onboarding@resend.dev>` (test) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Gmail SMTP relay — the primary sender, no verified domain needed |
| `MAIL_FROM` / `MAIL_FROM_NAME` | sender identity for Gmail relay |
| `TELEGRAM_BOT_TOKEN` | optional second lane (bot token only, no domain) |
| `TELEGRAM_BOT_NAME` | bot username for t.me pairing links |
| `BREAK_GLASS` | `1` enables emergency 5-minute login mint (default off) |
| `QUEUE_GLOBAL_CAP` / `QUEUE_LEAD_CAP` / `QUEUE_DRAIN` | mail automation caps (50 / 3 / 3) |
| `TOKEN_TTL_DAYS` | magic-link TTL, default `2` (48h) |
| `SESSION_SECRET` / `ADMIN_SECRET` | required in production (≥32 chars) |
| `CONTACT_EMAIL` | where beta notifications + daily digest land |
| `APP_URL` / `PUBLIC_API_URL` | public site/API origins used in email links |
| `DATABASE_URL` | Render Postgres; blank = in-memory (dev only) |
| `CLIENT_ORIGIN` | comma-separated CORS allowlist |
| `BETA_LIMIT` | beta cap, default `10` |
| `DAILY_ANALYSIS_CAP` | per-lead analyses/day, default `25` |
| `PORT` | API port |

## Deploy on Render (recommended: one Web Service)

1. Create a **Postgres** instance (free) → copy its **Internal Database URL**.
2. Create a **Web Service** from this repo:
   - **Build Command:** `npm install && npm run build && cd server && npm install`
   - **Start Command:** `node server/src/index.js`
3. Add the server env vars above, plus:
   - `NODE_ENV=production`
   - `DATABASE_URL=<Internal Database URL>`
   - `APP_URL=https://<your-service>.onrender.com`
   - `CLIENT_ORIGIN=https://<your-service>.onrender.com`
4. Deploy. The Express server serves `dist/` **and** `/api/*` on the same origin, so
   `VITE_API_URL` can stay blank.

> Two-service alternative: keep the existing Static Site and add a Web Service for
> `server/`. Then set `VITE_API_URL=https://<api>.onrender.com` on the static site and
> add the static site URL to `CLIENT_ORIGIN`.

## Known limitation

Resend **test mode** delivers only to the account owner's address. The app no
longer depends on it: the own-SMTP engine sends via Gmail relay
(`GMAIL_USER` + App Password, no verified domain needed), with Resend kept as
a fallback and Telegram as an opt-in second lane. If every sender fails, the
signup UI shows an honest status plus a fallback link instead of a fake
"check your inbox" — see `docs/owner-checklist.md` for the operator runbook.
