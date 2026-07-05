# AxioForm — Running & Deploying the Backend

The app has two build modes from one codebase:

| Mode | Command | Data | Where |
|---|---|---|---|
| **Static prototype** | `STATIC_EXPORT=1 npm run build` (CI strips `app/api`) | browser localStorage | GitHub Pages (current demo) |
| **Production server** | `npm run build && npm start` | SQLite/Postgres via Prisma | any Node host (Vercel, Railway, VPS) |

## Local development with the backend

```bash
cp .env.example .env        # set a real AUTH_SECRET
npm install                 # also runs `prisma generate`
npm run db:migrate          # creates prisma/dev.db
npm run db:seed             # demo accounts + fixture orders
npm run dev                 # http://localhost:3000
```

Seeded accounts (change these before any public deployment):

- `admin@axioform.ch` / `axioform-admin` — role **admin** (order management, quotes, customers)
- `m.keller@example.ch` / `demo1234` — customer with fixture orders

## What is server-side today

- **Accounts**: signup/login with bcrypt password hashes, 30-day httpOnly JWT session cookie (`AUTH_SECRET`).
- **Orders & quotes**: created via `POST /api/orders` — the server re-derives geometry, re-runs the SIA 358 checks (orders failing them are rejected with 422) and re-prices with the customer's trade tier. The client total is display-only.
- **Order lifecycle**: status changes, binding quotes and quote acceptance via `PATCH /api/orders/:ref`, with role checks (customers only see and accept their own).
- **Event log**: every lifecycle step is stored in `OrderEvent` with the email recipient — the hook point for transactional email.
- **Customers & tiers**: `GET/PATCH /api/customers` (admin only); tiers live on the user account and drive configurator pricing.

Still browser-local (next backend iteration): price-book publishing, custom
guardrail types, references CMS, saved configurations. Payments are recorded
but not charged — Stripe comes with hosting.

## Deploying to Vercel (recommended path)

1. **Database**: create a Postgres instance (Neon or Vercel Postgres, region `eu-central`/Zurich-near). In `prisma/schema.prisma` change `provider = "sqlite"` → `"postgresql"`, delete `prisma/migrations`, run `npx prisma migrate dev --name init` once against the new `DATABASE_URL`, commit the migration.
2. **Vercel project**: import the GitHub repo. Env vars: `DATABASE_URL`, `AUTH_SECRET` (long random string), `NEXT_PUBLIC_BACKEND=1`. Do **not** set `STATIC_EXPORT`.
3. **Seed** once: `DATABASE_URL=... node prisma/seed.mjs` (then change the admin password by re-registering flows or a direct DB update).
4. **Domain**: add your domain in Vercel; update `SITE` in `app/sitemap.ts` and `public/robots.txt`.
5. The GitHub Pages workflow keeps deploying the static demo from `main` unchanged; delete `.github/workflows/static.yml` when the demo is no longer needed.

## Stripe / TWINT (next step, needs your account)

Planned per `docs/IMPLEMENTATION_PLAN.md` §7: Stripe Checkout session created
server-side at `POST /api/orders` time for `payment: card|twint`, webhook
confirms payment → order status `confirmed` + event. Requires
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` once you have the account.
