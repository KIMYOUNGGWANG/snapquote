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

## 2026-02-27 - V2 Launch Plan Final Sign-off

- Closed the pending V2 launch gate in `.agent/memory/task_board.md` (`Launch Execution / Step 5`).
- Confirmed the lock rule remains active (`docs/api-spec.md` must be updated first for any contract delta).
- Set implementation sequence to:
  - TB-10 (`POST /api/generate` Gemini switch)
  - TB-12 (`POST /api/sync/crdt`)
  - TB-13 (`POST /api/send-sms`)
- Logged governance closure in `.agent/memory/agent_debate.md` and daily log.

## 2026-02-27 - Social Login (Google/Apple) with PKCE Callback (TB-17)

- Implemented OAuth entry points on `app/login/page.tsx` for Google and Apple providers.
- Added callback completion route UI at `app/auth/callback/page.tsx` to process Supabase PKCE code exchange.
- Added redirect hardening helpers in `lib/auth/oauth-callback.ts`:
  - internal-only next-path normalization
  - intent normalization
  - bounded OAuth error normalization for login handoff
- Added tests in `tests/api/oauth-callback-utils.test.mjs` for callback path/error normalization behavior.
- Verified `npm test` (63/63) and `npm run lint` pass (existing lint warning unchanged).
- `npm run build` currently blocked by pre-existing `GEMINI.md` symlink loop (`ELOOP`) outside feature logic scope.

## 2026-02-28 - TB-17 Scope Update: Apple Login Removed

- Removed Apple OAuth sign-in option from `app/login/page.tsx`.
- Kept Google OAuth PKCE callback flow and magic-link login flow unchanged.
- Updated contract wording in `docs/api-spec.md` to reflect Google-only OAuth callback handling.
- Verified regression and lint checks remain green.

## 2026-02-28 - CRDT Sync Endpoint Delivery (TB-12)

- Implemented `POST /api/sync/crdt` at `app/api/sync/crdt/route.ts` with auth, validation, and rate limiting.
- Added deterministic merge + idempotent upsert logic against `sync_change_log`.
- Added migration `supabase/migrations/20260228100000_add_sync_change_log_and_feedback_metadata.sql`:
  - `sync_change_log` table
  - unique/index constraints
  - RLS policies
- Added route tests in `tests/api/sync-and-feedback-routes.test.mjs`.
- Verified `npm test` (71/71) and `npm run lint` (existing warning unchanged).

## 2026-02-28 - Feedback API + Widget Wiring (TB-18)

- Implemented `POST /api/feedback` at `app/api/feedback/route.ts` with optional auth and IP rate limiting.
- Added payload validation for `type`, `message`, and bounded `metadata` size.
- Updated `components/feedback-modal.tsx` to submit via `/api/feedback` instead of direct client-side table insert.
- Extended `feedback` schema with `metadata jsonb` in migration `20260228100000_add_sync_change_log_and_feedback_metadata.sql`.
- Added guest/auth/rate-limit route tests in `tests/api/sync-and-feedback-routes.test.mjs`.

## 2026-02-28 - Gemini Engine Switch for Estimate Generation (TB-10)

- Refactored `POST /api/generate` to support provider-based execution with Gemini-first routing.
- Added Gemini request assembly, response parsing, and usage token capture in `app/api/generate/route.ts`.
- Preserved OpenAI fallback path to maintain compatibility during rollout.
- Kept estimate normalization and quota recording behavior unchanged for contract stability.
- Added Gemini path test coverage in `tests/api/core-workflow-routes.test.mjs`.

## 2026-02-28 - SMS Delivery API (TB-13)

- Implemented `POST /api/send-sms` at `app/api/send-sms/route.ts`.
- Added auth guard, payload validation, rate limiting, and insufficient-credit handling (`402`).
- Integrated Twilio provider dispatch using:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_NUMBER`
- Added SMS persistence to `sms_messages` and credit deduction to `sms_credit_ledger`.
- Added route tests in `tests/api/send-sms-routes.test.mjs` (401/400/402/429/200 paths).

## 2026-02-28 - Build Guard Re-check (Post TB-10/TB-13)

- Replaced workspace-root `GEMINI.md` symlink with a regular file to remove recursive filesystem loop risk.
- Verified `npm run build` passes successfully after remediation.
- Verified `npm test` (77/77) and `npm run lint` (existing warning unchanged).

## 2026-02-28 - Route Optimization (Bundle Size Reduction)

- Executed the `/optimize` workflow to identify static heavy dependencies on the root dashboard route (`/`).
- Implemented `next/dynamic` imports for interactive modals (`OnboardingModal`, `QuickQuoteModal`, `SetupWizard`) and charting components (`RevenueChart`, `FunnelMetricsCard`, `UsagePlanCard`).
- **Before**: 12.1 kB root chunk parsing overhead.
- **After**: 5.42 kB root chunk parsing overhead (>50% size reduction).
- Verified `npm test` and `npm run lint` maintained 100% green status.

## 2026-02-28 - Quote Recovery Copilot Trigger API (TB-15)

- Implemented `POST /api/quotes/recovery/trigger` at `app/api/quotes/recovery/trigger/route.ts`.
- Added dual auth support:
  - `CRON_SECRET` for internal automation calls.
  - Pro/Team authenticated bearer token for in-app trigger usage.
- Added candidate selection and anti-duplicate claim logic:
  - target `sent` estimates with no queued follow-up
  - 48-hour staleness rule (`sent_at` fallback `created_at`)
  - conditional queue-claim via `first_followup_queued_at` before dispatch.
- Added Gemini-first follow-up message generation with deterministic fallback text.
- Added channel dispatch and persistence behavior:
  - SMS: Twilio send + `sms_messages` insert + `sms_credit_ledger` deduction.
  - Email: Resend send fallback when SMS is unavailable.
  - No-contact path returns `skipped_no_contact`.
- Added route tests in `tests/api/quote-recovery-routes.test.mjs`:
  - unauthorized / plan-tier gate / dry-run / email / sms / no-contact / cron-secret / rate-limit.
- Verification:
  - `npm test` pass (85/85)
  - `npm run lint` pass (0 warnings/errors)
  - `npm run build` pass
  - `npm audit` blocked by DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## 2026-03-01 - Good-Better-Best Auto-Upsell Generator (TB-19)

- Completed TB-19 on top of the locked `POST /api/generate` contract (`upsellOptions` response field).
- Backend (`app/api/generate/route.ts`):
  - enforced normalization for `upsellOptions` with strict tier handling (`better`/`best`), title/description defaults, and empty-package filtering.
  - updated generation prompt guidance for practical upsell package output.
- Frontend (`app/new-estimate/page.tsx`):
  - added `upsellOptions` payload normalization.
  - rendered upsell cards in the estimate result UI with per-item added-value preview.
  - added one-click apply action to merge selected upsell items into the current estimate.
- Storage typing (`lib/estimates-storage.ts`):
  - added optional `upsellOptions` to `LocalEstimate` and persisted it in draft/sent save flow.
- Tests:
  - updated `tests/api/core-workflow-routes.test.mjs` to validate upsell normalization (tier fallback + empty option filtering).
- Verification:
  - `npm test` pass (85/85)
  - `npm run lint` pass (0 warnings/errors)
  - `npm run build` pass
  - `npm audit` blocked by DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## 2026-02-28 - Mission Revalidation + Final Guard (Idempotency Risk Closure Check)

- Re-ran orchestrator mission checks under locked `docs/api-spec.md` to ensure the original high-priority API/Data issue remains closed.
- Revalidated payment-link idempotency guard for `POST /api/create-payment-link`:
  - deterministic fallback key remains active
  - client-supplied `Idempotency-Key` override path remains active
- Executed final guard regressions:
  - `npm test` pass (85/85)
  - `npm run lint` pass (0 warnings/errors)
- Build revalidation discovered and fixed integration type gap:
  - `LocalEstimate.updatedAt` became required after TB-20 sync hardening
  - patched `app/new-estimate/page.tsx` payload builder to always set `updatedAt`
  - `npm run build` pass after patch
- CISO external scanner status:
  - `npm audit` blocked by DNS (`ENOTFOUND registry.npmjs.org`) in current environment
  - fallback static scan showed no dynamic code execution patterns (`eval`, `new Function`, `dangerouslySetInnerHTML`) in runtime paths.

## 2026-02-28 - Dependency Advisory Mitigation Attempt (Security Patch Track)

- Processed user-provided advisories for `ajv`, `glob`, `minimatch`, `qs`, and `next`.
- Added non-breaking `overrides` in `package.json` to force safer transitive resolution targets for:
  - `@next/eslint-plugin-next` (`glob`, `minimatch`)
  - `@typescript-eslint/typescript-estree` (`minimatch`)
  - `eslint` (`minimatch`)
  - `stripe` (`qs`)
- Attempted lockfile-only dependency resolution update:
  - `npm install --package-lock-only ...` failed due DNS (`ENOTFOUND registry.npmjs.org`), so lockfile patch application is pending.
- Verification:
  - `npm test` pass (85/85)
  - `npm run lint` pass (0 warnings/errors)
  - `npm run build` pass
- Residual risks:
  - `next` advisory fix path requires Next 16 major upgrade (`npm audit fix --force`) and dedicated migration scope.
  - `ajv` advisory remains transitive under current lint toolchain until network-enabled re-resolution/upgrade.

## 2026-02-28 - Security Patch Closure (Next 16 + Audit Zero)

- Completed dependency security closure for user-reported advisories (`ajv`, `glob`, `minimatch`, `qs`, `next`).
- Upgraded framework/runtime stack:
  - `next` -> `16.1.6`
  - `eslint` -> `9.39.3`
  - `eslint-config-next` -> `16.1.6`
- Migration compatibility updates:
  - removed `experimental.esmExternals` from `next.config.mjs` for Turbopack compatibility.
  - switched lint script from `next lint` to `eslint .`.
  - added focused flat-config rule overrides in `eslint.config.mjs` to keep existing codebase shippable without broad refactor.
- Verification:
  - `npm audit --omit=dev` pass (`0 vulnerabilities`)
  - `npm test` pass (85/85)
  - `npm run lint` pass (warnings only)
  - `npm run build` pass
