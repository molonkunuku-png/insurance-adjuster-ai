# Themis — Adjuster AI

Turn damage photos + a policy PDF into a structured loss-report draft.

- **Client:** React + Vite + Tailwind v4 (repo root, builds to `dist/`)
- **API:** Node + Express (`server/`) — owns the OpenAI key, transactional email, and Postgres

The browser never talks to OpenAI directly; all AI calls go through our API so the
`OPENAI_API_KEY` is never shipped to the client.

## Structure

```
.                # React client + Vite config
  src/           # components, lib/api.js, lib/ai.js
  server/        # Express API (auth-free for now)
    src/
      index.js   # boots db + server
      app.js     # routes: /api/health /api/beta /api/analyze /api/report
      db.js      # pg pool + schema, in-memory fallback
      email.js   # Resend confirmation + admin notification
      openai.js  # vision analyze + report generation
      config.js  # env loading
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
| `OPENAI_API_KEY` | server-side OpenAI key |
| `OPENAI_MODEL` | default `gpt-4o-mini` |
| `RESEND_API_KEY` | Resend transactional email |
| `RESEND_FROM` | e.g. `Themis <onboarding@resend.dev>` (test) |
| `CONTACT_EMAIL` | where beta notifications land |
| `APP_URL` | public site URL (used in email links) |
| `DATABASE_URL` | Render Postgres; blank = in-memory |
| `CLIENT_ORIGIN` | comma-separated CORS allowlist |
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

Resend **test mode** delivers only to the account owner's address. To email real
adjusters, verify a domain at `resend.com/domains` and set `RESEND_FROM` to an address
on that domain.
