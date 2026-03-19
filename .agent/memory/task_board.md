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

- [ ] `TB-07` Validate and expose `/api/billing/usage` in pricing and estimate flows so the free-tier tightening experiment can be measured.
- [ ] `TB-14` Wire `/api/billing/stripe/checkout`, `/api/billing/stripe/portal`, and `/api/billing/subscription` into annual billing upsell and self-serve plan management.
- [ ] `TB-12` Validate `/api/sync/crdt` and LWW sync behavior against offline editing scenarios before trust-focused messaging ships.
- [ ] `TB-13` Operationalize `/api/send-sms` as a paid differentiator with credit enforcement, idempotency checks, and UI entry points.
- [ ] `TB-15` Run `/api/quotes/recovery/trigger` in dry-run mode first, then productionize quote recovery for Pro and Team plans.
- [ ] `TB-18` Close the loop on `/api/feedback` so product, bug, and feature submissions feed weekly triage.

## P1 Conversion And Acquisition

- [ ] `TB-01` Verify `/api/transcribe` language-hint quality for `es` and `ko` field audio in the beachhead contractor workflows.
- [ ] `TB-02` Validate `/api/generate` multilingual normalization, warnings, and estimate output quality for Spanish and Korean notes.
- [ ] `TB-03` Instrument `/api/send-email` around PDF delivery, watermark behavior, and referral URL usage.
- [ ] `TB-04` Verify `/api/create-payment-link` tenant ownership checks, Stripe Connect gating, and estimate resolution paths.
- [ ] `TB-08` Validate `/api/stripe/connect/onboard`, `/api/stripe/connect/status`, and `/api/stripe/connect/dashboard-link` in the contractor onboarding funnel.
- [ ] `TB-09` Verify `/api/payments/stripe/status` polling and estimate settlement sync in authenticated flows.
- [ ] `TB-22` Position `/api/parse-receipt` as a Pro or Team upsell and validate parse quality against real receipt images.
- [ ] `TB-23` Connect `/api/public/parse-receipt` and `/api/public/capture-lead` into a measurable teaser-to-lead funnel.

## P2 Settlement And Platform Reliability

- [ ] `TB-05` Audit `/api/webhooks/stripe` ownership checks, paid-state transitions, and ops alert behavior.
- [ ] `TB-06` Audit `/api/webhooks/stripe/reconcile` for missed-session recovery, gap counting, and cron auth handling.
- [ ] `TB-17` Verify `/auth/callback` against the force-reload auth transition strategy and PKCE success path.
- [ ] `SEO-3` Verify `/sitemap.xml` generation for current public routes and pricing pages.
- [ ] `SEO-4` Verify `/robots.txt` output and sitemap discoverability alignment.

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
