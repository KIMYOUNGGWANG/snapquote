# SnapQuote

SnapQuote is a field-first quoting app for owner-operators and small trade crews.

Core promise:

> Quote the job before you drive off.

It is built for the jobs where office software usually fails:

- weak-signal basements, crawlspaces, and job sites
- dirty hands where voice is faster than typing
- rough or broken English that still needs to become a clean customer quote

## Current status

As of 2026-03-10, this repository is in "private beta ready" territory.

Validated locally:

- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `npm run build`
- `npm start`
- `npm run smoke:deploy -- --base-url=http://127.0.0.1:3000`

Not yet proven enough for broad paid launch:

- full browser E2E coverage
- live third-party smoke tests across all integrations
- production-grade launch playbook

See:

- [Beta launch readiness](./docs/beta-launch-readiness.md)
- [Market positioning](./docs/market-positioning.md)

## Core workflows

- Voice notes -> transcript -> structured estimate
- PDF preview and send flow
- Offline capture with local storage and later sync
- Payment-ready quotes with Stripe
- Follow-up and usage controls for paid plans

## Tech stack

| Area | Stack |
| --- | --- |
| Frontend | Next.js 16, React 18, TypeScript, Tailwind CSS |
| Local-first | IndexedDB via `idb`, service worker |
| Backend | Supabase Auth, Postgres, Edge Functions |
| AI | OpenAI and optional Gemini provider fallback |
| Documents | `@react-pdf/renderer` |
| Payments | Stripe + Stripe Connect |
| Messaging | Resend and optional Twilio |

## Quick start

1. Install dependencies.

```bash
npm install
```

2. Copy the example environment file and fill in the required values.

```bash
cp .env.example .env.local
```

3. Start the app.

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Use `.env.example` as the source of truth.

Required for the core quote flow:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Required for billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BILLING_WEBHOOK_SECRET`
- `STRIPE_BILLING_PRICE_STARTER_MONTHLY`
- `STRIPE_BILLING_PRICE_PRO_MONTHLY`
- `STRIPE_BILLING_PRICE_TEAM_MONTHLY`

Required for email and operational alerts:

- `RESEND_API_KEY`
- `OPS_ALERT_EMAIL`

Optional but recommended:

- `CRON_SECRET`
- `RATE_LIMIT_PROVIDER=upstash`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `GEMINI_API_KEY`

## Useful commands

```bash
npm run dev
npm run lint
npm test
npm run test:e2e
npm run build
npm start
npm run validate:env -- --preset=beta
npm run smoke:deploy -- --base-url=http://127.0.0.1:3000
```

## Project structure

```text
app/
  api/                     API routes for AI, billing, messaging, sync, analytics
  landing/                 Marketing landing page
  new-estimate/            Core field quote builder
  pricing/                 Self-serve pricing page

components/
  audio-recorder.tsx       Voice capture UI
  estimate-pdf.tsx         PDF document renderer
  pdf-preview-modal.tsx    Quote preview and download

lib/
  db.ts                    IndexedDB stores
  estimates-storage.ts     Local quote persistence helpers
  rate-limit.ts            Memory and Upstash rate limiting
  server/                  Auth, billing, usage quota helpers
```

## Documentation

- [Product requirements](./PRODUCT_REQUIREMENTS_DOCUMENT.md)
- [Master specification](./MASTER_SPECIFICATION.md)
- [Automation expansion PRD](./AUTOMATION_PRD.md)
- [Development status](./DEVELOPMENT.md)
- [Beta launch readiness](./docs/beta-launch-readiness.md)
- [Market positioning](./docs/market-positioning.md)

## License

MIT
