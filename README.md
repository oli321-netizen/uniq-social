# Uniq

Uniq Social. The public home page is the original marketing page. Signing in lands on the processor at `/dashboard`.

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
| `OPENAI_API_KEY` | For Editor Lab transcription | Whisper word timestamps, tighter hook lines, caption translation, and OpenAI text-to-speech. If unset, upload stops and says a key is needed. Translation refuses instead of inventing text. Voice-over falls back to local espeak. Caption text still has a labelled mock. |
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

Editor Lab is at `/hub/editor-lab` after sign-in. `/hub/hook-lab` redirects there. Transcription needs `OPENAI_API_KEY`.

## What is on main

- Home page: the original public marketing page. After sign-in, people land on `/dashboard`.
- A section nav (Process, Editor Lab, Variants, Creators, Results, Presets, Team, Settings) on the processor and the other sections.
- Editor Lab at `/hub/editor-lab` (old `/hub/hook-lab` redirects). Upload a talking video, transcribe it with Whisper (`whisper-1`, word timestamps), cut from the transcript, and edit on a timeline. Export is a separate ffmpeg route. It does not use `/api/process`. OpenAI errors show the status and message. Without `OPENAI_API_KEY`, transcription stops and says a key is needed. `HOOK_LAB_STUB=1` still builds the whisper-1 request, then answers it locally. It does not call OpenAI and is not for production.
- Working in Editor Lab: multi-clip timeline, import video/image/audio, overlay track, titles and emoji, fade and slide transitions, colour presets (brightness, contrast, saturation, temperature), punch / shake / blur, per-clip speed from 0.25× to 4× plus a two-step slow-mo ramp, reverse, volume and audio fades, music track, auto-captions, translation when a key is set, local or OpenAI voice-over, aspect 9:16 / 1:1 / 16:9, 720p or 1080p, 24/30/60 fps, blur fill or black bars, two position keys, crop, rotate, flip, freeze frame, per-user templates, silence and filler cuts, beat markers that snap. A plain 9:16 1080p 30fps edit still uses the original cover-crop export.
- Not in Editor Lab yet: a continuous speed curve, translation or OpenAI voices without `OPENAI_API_KEY`, more than one overlay track and one music track (four clips each), colour-emoji that matches the browser, recutting the whole timeline to the beat, masks, chroma key, a sticker library, and smooth scale keyframes (position moves; scale stays on the first key).
- Creators: brand voice (tone, words to use, words to avoid, sample lines) used by Editor Lab and captions.
- Captions: text only, no hashtags. Mock templates when `OPENAI_API_KEY` is unset.
- Variants: cards for renders the existing processor already logged, plus caption exports saved from Editor Lab. The processor does not keep the mp4. Attach the downloaded file to preview, compare, or download it. Delete removes that card. Rendering is unchanged.
- Quick upload: one local drop zone on Creators. It does not call `/api/process` and it is not an asset library.
- Notifications: in-app bell, mark read, email and in-app toggles.
- Results: manual entry and CSV import. Presets: save, load into the form, delete.
- Team stays a stub.
- The processor at `/dashboard` and `src/app/api/process/route.ts` are unchanged. Do not edit CapCut, Snapchat, iPhone, anti-detect, or edit-parameter controls.

`OPENAI_API_KEY` also covers captions. Notifications can email through `RESEND_API_KEY` when email is enabled; a missing key only skips the email. Attached variant files are stored under `VARIANT_STORAGE_DIR` or `./storage` (not committed).
