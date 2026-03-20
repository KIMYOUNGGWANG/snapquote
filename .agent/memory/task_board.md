# SnapQuote Task Board
## Planning Session Reset

**Date:** 2026-03-20
**Source of truth:** `docs/api-spec.md` (LOCKED), `RESEARCH/SnapQuote_Strategy_20260318/outputs/snapquote_strategy_report_2026.md`
**Planning mode:** Strategy-to-runtime realignment board

## Planning Notes

- `docs/api-spec.md` remains the locked runtime contract for implemented endpoints.
- The previous board accurately reflected the runtime contract, but not the full 2026 strategy report.
- This board now separates:
  - delivered runtime foundation
  - strategy gaps still requiring product or engineering work
  - non-code GTM backlog that should not be misreported as shipped
- Any item that needs new endpoints must update `docs/api-spec.md` before `/develop`.

## Gate Status

- [x] Contract lock confirmed: `docs/api-spec.md`
- [x] Strategy report re-reviewed against the current repo on 2026-03-20
- [x] Current runtime foundation verified in code
- [ ] User sign-off for the refreshed planning baseline

## Track A: Locked Runtime Foundation Delivered

### Revenue, Trust, And Reliability

- [x] `TB-07` Usage visibility is wired through `/api/billing/usage` and surfaced in pricing and estimate flows.
- [x] `TB-14` Annual billing, checkout, portal, and subscription status are wired through `/api/billing/stripe/*` and `/api/billing/subscription`.
- [x] `TB-12` Offline sync conflict resolution is implemented through `/api/sync/crdt` plus shared LWW timestamp helpers and tests.
- [x] `TB-13` Premium SMS delivery is operational through `/api/send-sms` with idempotency-aware sending.
- [x] `TB-15` Quote Recovery dry-run and live dispatch are operational through `/api/quotes/recovery/trigger`.
- [x] `TB-18` Feedback intake and weekly triage reporting are closed through `/api/feedback` and `/api/feedback/report`.

### Conversion, Acquisition, And Settlement

- [x] `TB-01` Multilingual transcription behavior is verified for `/api/transcribe`.
- [x] `TB-02` Multilingual estimate generation normalization is verified for `/api/generate`.
- [x] `TB-03` Email delivery, PDF attachment behavior, watermarking, and referral URL inclusion are verified for `/api/send-email`.
- [x] `TB-04` Payment-link creation and tenant ownership checks are verified for `/api/create-payment-link`.
- [x] `TB-08` Stripe Connect onboarding and dashboard flows are verified for `/api/stripe/connect/*`.
- [x] `TB-09` Authenticated payment status polling is verified for `/api/payments/stripe/status`.
- [x] `TB-22` Pro or Team receipt parsing is verified for `/api/parse-receipt`.
- [x] `TB-23` Public teaser receipt scan and lead capture are verified for `/api/public/parse-receipt` and `/api/public/capture-lead`.
- [x] `TB-05` Stripe settlement webhook ownership checks and paid-state transitions are verified for `/api/webhooks/stripe`.
- [x] `TB-06` Stripe reconcile backfill behavior is verified for `/api/webhooks/stripe/reconcile`.
- [x] `TB-17` OAuth callback and force-reload auth transition behavior are verified for `/auth/callback`.
- [x] `SEO-3` Current public route coverage is verified for `/sitemap.xml`.
- [x] `SEO-4` Crawl policy alignment is verified for `/robots.txt`.

## Track B: Strategy Gaps Still Open

### P0 Conversion Engine Realignment

- [x] `SG-01` Realigned the free tier to 3 quotes per month across quota logic, anonymous draft gating, public copy, upgrade prompts, and live usage messaging.
  Delivered in code: `lib/free-tier.ts`, `lib/server/usage-quota.ts`, `app/api/generate/route.ts`, `app/page.tsx`, `app/landing/page.tsx`, `app/pricing/page.tsx`, and `components/usage-plan-card.tsx`.
  Verification target: free-tier UI and quota responses now use the same 3-quote cap.
  Contract note: no new endpoint was required.

- [x] `SG-02` Shipped referral program v1 with reward claim, localized share copy, auto-attribution, and referral dashboard visibility.
  Delivered in code: `docs/api-spec.md`, `app/api/referrals/claim/route.ts`, `app/api/referrals/status/route.ts`, `components/referral-attribution-manager.tsx`, `components/referral-status-card.tsx`, and `supabase/migrations/20260320101500_add_referral_claims_and_rewards.sql`.
  Verification target: contractors can generate a referral link, automatically claim attribution after sign-in, see dashboard metrics, and receive reward state.
  Contract note: new endpoints were locked in `docs/api-spec.md` before implementation.

- [x] `SG-03` Shipped the 3-stage onboarding lifecycle email sequence for Day 0, Day 3, and Day 7 activation.
  Delivered in code: `docs/api-spec.md`, `app/api/onboarding/lifecycle/trigger/route.ts`, `lib/server/onboarding-lifecycle.ts`, `supabase/migrations/20260320114000_add_onboarding_lifecycle_sends.sql`, and `tests/api/onboarding-lifecycle-routes.test.mjs`.
  Verification target: ops can dry-run or dispatch onboarding emails, duplicate sends are blocked by stage ledger, and already activated users are skipped for later stages.
  Contract note: new internal ops endpoint was locked in `docs/api-spec.md` before implementation.

### P0 Field Trust And P1 Pro Differentiation

- [x] `SG-04` Hardened the offline-first quote workflow with queue visibility and reconnect recovery.
  Delivered in code: `lib/offline-events.ts`, `lib/offline-sync.ts`, `components/offline-banner.tsx`, `components/sync-manager.tsx`, `app/history/page.tsx`, `lib/estimates-storage.ts`, and `lib/db.ts`.
  Verification target: users can see pending local draft or audio work, understand that changes are device-local while offline, and confirm which estimates are still queued for sync after reconnect.
  Contract note: stayed within the current locked contract because the work is client-side productization on top of existing `/api/sync/crdt`.

- [x] `SG-05` Built the Pro photo-estimate workflow from jobsite photos to suggested materials, scope, and pricing.
  Delivered in code: `docs/api-spec.md`, `app/api/generate/route.ts`, `app/new-estimate/page.tsx`, `lib/validation/api-schemas.ts`, and `tests/api/core-workflow-routes.test.mjs`.
  Verification target: a Pro or Team user can switch on Photo Estimate mode, send jobsite photos through `/api/generate`, and receive estimate-ready items plus structured photo analysis.
  Contract note: implemented by extending the locked `/api/generate` contract with `workflow = "photo_estimate"` and `photoAnalysis`.

- [x] `SG-06` Built a real QuickBooks integration for invoice creation and status handoff.
  Delivered in code: `docs/api-spec.md`, `app/api/quickbooks/connect/start/route.ts`, `app/api/quickbooks/connect/token/route.ts`, `app/api/quickbooks/status/route.ts`, `app/api/quickbooks/invoices/sync/route.ts`, `app/quickbooks/callback/page.tsx`, `lib/server/quickbooks.ts`, `lib/quickbooks.ts`, `app/history/page.tsx`, `lib/estimates-storage.ts`, `supabase/migrations/20260320143000_add_quickbooks_integration.sql`, and `tests/api/quickbooks-routes.test.mjs`.
  Verification target: contractors can connect QuickBooks Online, sync a local estimate into a QuickBooks invoice without CSV import, and see QuickBooks sync status in History.
  Contract note: new QuickBooks endpoints are locked in `docs/api-spec.md`.

- [x] `SG-07` Finished PDF customization as a productized paid differentiator.
  Delivered in code: `app/profile/page.tsx`, `app/pricing/page.tsx`, `app/new-estimate/page.tsx`, `app/history/page.tsx`, and `lib/pdf-branding.ts`.
  Verification target: Starter and above unlock logo-branded PDFs, Pro and Team unlock full-page estimate background templates, and pricing plus profile surfaces explain the difference clearly.
  Contract note: no API change was required because this stayed within existing profile and PDF generation flows.

### P2 Expansion

- [x] `SG-08` Defined and shipped Team collaboration MVP separately from the existing Team billing plan.
  Delivered in code: `docs/api-spec.md`, `app/api/team/workspace/route.ts`, `app/api/team/invites/route.ts`, `app/api/team/invites/accept/route.ts`, `app/api/team/estimates/route.ts`, `lib/server/team-workspace.ts`, `lib/team.ts`, `app/team/page.tsx`, `app/profile/page.tsx`, `supabase/migrations/20260320170000_add_team_workspaces.sql`, and `tests/api/team-routes.test.mjs`.
  Verification target: Team plan users can bootstrap a workspace, invite crew with role-scoped links, accept invites, and review one shared synced estimate feed across workspace members.
  Contract note: new Team collaboration endpoints were locked in `docs/api-spec.md` before implementation.

- [x] `SG-09` Added Team shared composer editing with edit-session lease, handoff, and direct shared saves.
  Delivered in code: `docs/api-spec.md`, `app/api/team/estimates/[estimateId]/route.ts`, `app/api/team/estimates/[estimateId]/session/route.ts`, `lib/server/team-estimates.ts`, `lib/team.ts`, `app/new-estimate/page.tsx`, `app/team/page.tsx`, `supabase/migrations/20260320183000_add_team_estimate_sessions.sql`, `tests/api/team-editing-routes.test.mjs`, and `tests/mocks/state.mjs`.
  Verification target: a Team member can open a shared estimate in the composer, see whether another teammate currently holds the edit session, claim or take over that session, and save changes directly back to the shared cloud estimate.
  Contract note: Team editing endpoints and session lease behavior were locked in `docs/api-spec.md` before implementation.

## Track C: GTM And Partnership Backlog

- [ ] `GTM-01` Complete Spanish and Korean ASO for app-store metadata, screenshots, and keyword sets.
- [ ] `GTM-02` Start Spanish YouTube creator outreach and partner negotiations.
- [ ] `GTM-03` Start KACC and NHCA community partnership outreach.
- [ ] `GTM-04` Start Spanish SEO content production for the priority contractor segments.

## Recommended `/develop` Order

- [x] Batch 1: `SG-01` free-tier realignment plus copy alignment
- [x] Batch 2: `SG-02` referral program v1
- [x] Batch 2A: `SG-03` onboarding lifecycle activation
- [x] Batch 3: `SG-04` offline-first workflow hardening
- [x] Batch 4: `SG-05` photo-estimate spec and implementation
- [x] Batch 5: `SG-06` QuickBooks integration spec and implementation
- [x] Batch 6: `SG-07` PDF branding packaging and `SG-08` Team workspace MVP
- [x] Batch 7: `SG-09` Team shared composer editing and session handoff

## Exit Criteria For This Planning Reset

- [x] Delivered runtime work is separated from still-open strategy work
- [x] Every completed runtime item still maps to the locked API contract
- [x] Out-of-contract strategy gaps are explicitly marked as requiring spec updates before implementation
- [ ] User approves the refreshed board as the new source for `/develop`

## Delivery Summary Preserved

- [x] `38bfe14` `feat: wire runtime revenue and reliability flows`
- [x] `309d18e` `feat: harden multilingual intake and sms idempotency`
- [x] `eb85ac1` `feat: add guided demo quote onboarding`
