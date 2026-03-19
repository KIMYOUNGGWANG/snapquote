# SnapQuote Task Board
## Planning Session

**Date:** 2026-03-19
**Source of truth:** `docs/api-spec.md` (LOCKED), `RESEARCH/SnapQuote_Strategy_20260318/outputs/snapquote_strategy_report_2026.md`
**Planning mode:** Runtime-aligned execution board

## Planning Notes

- `docs/api-spec.md` already matches the locked runtime contract shared in this session.
- `conductor/product.md` has been refreshed to match SnapQuote planning context.
- This board tracks active runtime work only. Every checkbox item maps to at least one locked endpoint.

## Gate Status

- [x] Contract lock confirmed: `docs/api-spec.md`
- [x] Strategy input reviewed: 2026 strategy report
- [ ] User sign-off for `/develop` handoff

## P0 Revenue And Trust

- [x] `TB-07` Exposed `/api/billing/usage` in pricing and estimate flows, unified the usage snapshot client helper, and made free-tier measurement visible before rollout.
- [x] `TB-14` Wired `/api/billing/stripe/checkout`, `/api/billing/stripe/portal`, and `/api/billing/subscription` into annual billing upsell, billing-cycle selection, and clearer self-serve management UI.
- [x] `TB-12` Validated `/api/sync/crdt` and locked the client-side LWW timestamp resolution behind shared helpers and tests for offline editing scenarios.
- [x] `TB-13` Operationalized `/api/send-sms` with shared client sending logic, idempotency-aware UI calls, and SMS entry points from both estimate send and history flows.
- [x] `TB-15` Added Quote Recovery preview-first controls in automation settings, then enabled live Pro or Team dispatch after a successful dry-run review.
- [x] `TB-18` Closed the loop on `/api/feedback` with a CRON-protected weekly triage report endpoint for bug, feature, and general submissions.

## P1 Conversion And Acquisition

- [x] `TB-01` Verified `/api/transcribe` language-hint handling for `es`, `ko`, and `auto` with multilingual trade-prompt coverage in the contractor workflows.
- [x] `TB-02` Validated `/api/generate` multilingual normalization, warning handling, and English customer-facing output for Spanish, Korean, and mixed-language notes.
- [x] `TB-03` Verified `/api/send-email` PDF attachment delivery, free-vs-paid watermark behavior, and referral URL inclusion through route-level coverage.
- [x] `TB-04` Verified `/api/create-payment-link` tenant ownership checks, Stripe Connect gating, estimate resolution, and idempotency through route-level coverage.
- [x] `TB-08` Validated `/api/stripe/connect/onboard`, `/api/stripe/connect/status`, and `/api/stripe/connect/dashboard-link` auth and funnel-state behavior in the contractor onboarding flow.
- [x] `TB-09` Verified `/api/payments/stripe/status` authenticated polling, paid-session matching, and Stripe auth-failure handling.
- [x] `TB-22` Verified `/api/parse-receipt` Pro or Team gating, normalization, and warning quality through receipt route coverage.
- [x] `TB-23` Connected `/api/public/parse-receipt` and `/api/public/capture-lead` into a tested teaser-to-lead funnel with rate-limit and lead upsert coverage.

## P2 Settlement And Platform Reliability

- [x] `TB-05` Audited `/api/webhooks/stripe` ownership checks, async-payment metadata fallback, paid-state transitions, and ops alert behavior.
- [x] `TB-06` Audited `/api/webhooks/stripe/reconcile` for missed-session recovery, gap counting, cron auth handling, and Stripe list-failure alerting.
- [x] `TB-17` Verified `/auth/callback` against the force-reload auth transition strategy and preserved `next` or `intent` context for PKCE timeout recovery.
- [x] `SEO-3` Verified `/sitemap.xml` generation for current public marketing, pricing, and legal routes while excluding private app surfaces.
- [x] `SEO-4` Verified `/robots.txt` output, added `/auth/` blocking, and confirmed sitemap discoverability alignment.

## Runtime Baseline Already Present

- [x] Core estimate runtime routes exist: `TB-01`, `TB-02`, `TB-03`, `TB-04`
- [x] Billing and settlement routes exist: `TB-05`, `TB-06`, `TB-07`, `TB-08`, `TB-09`, `TB-14`
- [x] Growth and retention routes exist: `TB-12`, `TB-13`, `TB-15`, `TB-18`, `TB-22`, `TB-23`
- [x] Discoverability and auth routes exist: `TB-17`, `SEO-3`, `SEO-4`

## Exit Criteria For Planning

- [ ] P0 tasks have owners, success metrics, and rollout order
- [ ] Free-tier experiment is defined with measurement points
- [ ] Annual billing rollout is sequenced behind contract-safe UI changes
- [ ] Offline trust work has a validation plan
- [ ] Growth funnel tasks have source-to-conversion tracking
