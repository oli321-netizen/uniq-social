# Uniq

Uniq Social. The home page is a list of services. Hook Lab writes and stores estimated hook lines per creator. Rendering still goes through the existing processor at `/dashboard`.

## Go live on Railway

1. Push this branch and deploy it with the Nixpacks builder (see `nixpacks.toml` and `railway.json`).
2. Add a Postgres plugin. Copy its `DATABASE_URL` onto the web service.
3. Set the variables below. Do not commit them.
4. Deploy. The start command runs `prisma migrate deploy`, then seeds promo codes, then `next start`.
5. Open `https://<your-domain>/api/health`. You want `{ "ok": true, "db": "up" }`.
6. Set `NEXTAUTH_URL` to that public origin and redeploy once so sign-in cookies match the host.
7. Sign up needs `RESEND_API_KEY` for the email code. Until mail works, create the first user from a trusted shell with Prisma, or use an account that already exists.

If the database was previously created with `prisma db push` and has no `_prisma_migrations` table, `migrate deploy` fails because the tables already exist. Baseline once, then redeploy:

```bash
npx prisma migrate resolve --applied 0001_init
```

The start script falls back to `prisma db push` if migrate deploy fails, so an old database can still boot. Prefer the baseline so later migrations apply cleanly.

FFmpeg stays installed via `nixpacks.toml` for the existing processor. This app does not change that pipeline.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string |
| `NEXTAUTH_SECRET` | Yes in production | Signs session cookies. The code falls back to a dev string if this is empty. Set a long random value before go-live. |
| `NEXTAUTH_URL` | Yes in production | Public origin, no trailing slash, for example `https://your-app.up.railway.app` |
| `OPENAI_API_KEY` | No | Live hook lines. If unset, Hook Lab uses labelled template estimates. |
| `OPENAI_MODEL` | No | Defaults to `gpt-4o-mini` |
| `STRIPE_SECRET_KEY` | For top-up and plans | Checkout and subscriptions |
| `STRIPE_WEBHOOK_SECRET` | For Stripe | Webhook signature |
| `RESEND_API_KEY` | For email | Verification codes and team invites |
| `RESEND_FROM_EMAIL` | No | From address. Defaults to `UniqSocial <noreply@uniqsocial.com>` |

Copy `.env.example` to `.env` for local work. Never commit `.env`.

## Local development

```bash
npm install
# Postgres running, DATABASE_URL set
npx prisma migrate deploy
npm run dev
```

Health check: `GET /api/health`.

Hook Lab is at `/hub/hook-lab` after sign-in. Demo mode needs no model key.

## What is on main

- Home page: a list of services. Video processor links straight to `/dashboard`.
- A short top bar on the other services, with a link back to that list
- Hook Lab: hook list, preview, timeline, live metrics, generate, edit, favourite, delete, per-creator history, mock mode. Reframe and B-roll stay coming soon.
- Creators: brand voice (tone, words to use, words to avoid, sample lines) used by Hook Lab and captions.
- Captions: text only, no hashtags. Mock templates when `OPENAI_API_KEY` is unset.
- Variants: cards for renders the existing processor already logged. The processor does not keep the mp4. Attach the downloaded file to preview, compare, or download it. Delete removes that card. Rendering is unchanged.
- Quick upload: one local drop zone on Hook Lab and Creators. It does not call `/api/process` and it is not an asset library.
- Notifications: in-app bell, mark read, email and in-app toggles.
- Results: manual entry and CSV import. Presets: save, load into the form, delete.
- Team stays a stub.
- The processor at `/dashboard` and `src/app/api/process/route.ts` are unchanged. Do not edit CapCut, Snapchat, iPhone, anti-detect, or edit-parameter controls.

`OPENAI_API_KEY` also covers captions. Notifications can email through `RESEND_API_KEY` when email is enabled; a missing key only skips the email. Attached variant files are stored under `VARIANT_STORAGE_DIR` or `./storage` (not committed).
