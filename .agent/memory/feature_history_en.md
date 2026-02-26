# Feature History (EN)

## 2026-02-20 - Payment Link Idempotency Hardening

- Added idempotency handling to `POST /api/create-payment-link`.
- Supports optional `Idempotency-Key` request header.
- Falls back to deterministic server-generated idempotency key when header is missing.
- Updated API contract note in `docs/api-spec.md`.
- Added route tests for deterministic key generation and header override.
- Updated test runtime compatibility for Node 20 by transpiling `.ts/.tsx` in `tests/loader.mjs`.

## 2026-02-20 - Dependency Security Patch (Audit Remediation)

- Replaced Excel import parser with CSV-only parser to remove direct `xlsx` usage.
- Removed `next-pwa` config wrapper and introduced manual service worker registration.
- Replaced generated Workbox service worker with app-owned lightweight `public/sw.js`.
- Added Next image optimizer hardening (`unoptimized: true`, empty `remotePatterns`).
- Preserved API contract and confirmed regression tests pass.
- Pruned local dependency tree so `next-pwa` and `xlsx` are no longer installed.

## 2026-02-24 - Frontend Payment Success Route Closure

- Added `app/payment-success/page.tsx` to complete Stripe post-checkout redirect flow.
- Implemented a dedicated confirmation UI with direct follow-up actions (`/history`, `/new-estimate`).
- Added operational note in UI for webhook/reconcile async status reflection.
- Documented payment completion redirect target in `docs/api-spec.md` operational note section.
- Closed task board item `Develop Execution 1B (Frontend Thread)` without API contract changes.

## 2026-02-24 - Guest Paid Status Auto-Sync

- Added `GET /api/payments/stripe/status` to the locked API contract for guest/local payment status probing.
- Implemented Stripe status route at `app/api/payments/stripe/status/route.ts` with rate limiting and metadata fallback.
- Extended local estimate model with payment tracking fields (`paymentLinkId`, `paymentLink`, `paymentLinkType`, sync markers).
- Updated `app/new-estimate/page.tsx` to persist payment link identifiers and guarantee `sent` persistence after successful email send.
- Updated `app/history/page.tsx` to poll Stripe payment status and auto-transition local estimates from `sent` to `paid`.
- Added route tests in `tests/api/stripe-routes.test.mjs` and verified `npm test`/`npm run lint`.

## 2026-02-24 - Stripe Connect Multi-Tenant Ownership

- Switched payment architecture from platform-owned links to tenant-owned Stripe Connect accounts.
- Added Stripe Connect APIs:
  - `POST /api/stripe/connect/onboard`
  - `GET /api/stripe/connect/status`
  - `POST /api/stripe/connect/dashboard-link`
- Updated `POST /api/create-payment-link` to require auth and create links using caller `stripeAccount`.
- Added profile schema migration for connect mapping fields (`stripe_account_id`, `stripe_*_enabled`, `stripe_onboarded_at`).
- Added Stripe Connect management card on `app/profile/page.tsx` for onboarding, status refresh, and dashboard access.
- Updated payment-link UX in estimate and quick-quote flows with explicit 401/403 Connect guidance.
- Added tests for connect routes and connected-account payment-link constraints; regression suite remains green.

## 2026-02-25 - Build Guard Recovery (TB-11)

- Resolved `next build` blocker caused by workspace-root `GEMINI.md` symlink loop (`ELOOP`).
- Replaced symlinked `GEMINI.md` with a regular file to stabilize filesystem traversal in build tooling.
- Fixed Supabase helper typing in `lib/server/stripe-connect.ts` using explicit `SupabaseClient` types to satisfy production type checking.
- Updated `tsconfig.json` excludes to avoid non-runtime workspace folders (`codex`, `.agent`) being type-checked during app build.
- Removed `useSearchParams` dependency from `app/login/page.tsx` and `app/new-estimate/page.tsx` to satisfy Next static prerender constraints.
- Verified `npm run build`, `npm run lint`, and `npm test -- --runInBand` all pass (with one pre-existing lint warning unchanged).

## 2026-02-25 - SaaS Subscription Billing (TB-14)

- Added Stripe Billing SaaS endpoints:
  - `POST /api/billing/stripe/checkout`
  - `POST /api/billing/stripe/portal`
  - `GET /api/billing/subscription`
  - `POST /api/webhooks/stripe/billing`
- Added billing helper utilities in `lib/server/stripe-billing.ts` for plan/price/status normalization.
- Added profile billing schema migration:
  - `supabase/migrations/20260225150000_add_stripe_billing_to_profiles.sql`
- Connected `/pricing` page CTA to real checkout flow and added billing portal management button.
- Added subscription status rendering on pricing page to show current plan and status.
- Expanded Stripe test mocks and added route tests in `tests/api/billing-subscription-routes.test.mjs`.
- Verified `npm run lint`, `npm test -- --runInBand` (58/58), and `npm run build` all pass.

## 2026-02-25 - Database Security Patch (Audit Remediation)

- Addressed critical missing database optimizations identified during static schema audit.
- Added B-Tree indexes for `estimate_items(estimate_id)`, `automations(user_id)`, `job_queue(user_id)`, and `feedback(user_id)`.
- Removed overly permissive `Anyone can insert referral events` RLS policy to mitigate DDoS/storage bloat risks.
- Replaced `to authenticated` with `to public` (no role restriction) for `pricing_experiments` select policy so unauthenticated visitors can view A/B pricing structures.
- Removed duplicate unique index on `estimate_attachments(estimate_id)`.
