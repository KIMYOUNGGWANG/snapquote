# Task Board: Estimate Generation & Delivery Runtime

- Project: SnapQuote
- Version: v1.1 (Hotfix)
- Date: 2026-02-20
- Status: V1 complete; V2 launch planning ready for user sign-off

## Develop Loop Init (Orchestrator 4.1)

- Current mission: Resolve Critic high-priority API/Data issue (duplicate payment link risk) under locked contract.
- Recommended model: `[LIGHT]` (API handler hardening + test update, bounded scope).
- Active agents:
  - Orchestrator (contract check and board control)
  - Backend Thread A (API Builder)
  - Critic (post-fix audit)
  - Secretary (history + daily log updates)

## Mission Resolution

- `Mission` section in `.agent/memory/codex_context.txt` is empty.
- Fallback applied: execute required Architect workflow artifacts from Rule 3 (task board + locked API spec + critique + daily log).

## Phase Checklist

- [x] 0. Intelligence setup and context scan complete.
- [x] 1. Goal alignment complete (`conductor/product.md` reviewed).
- [x] 2. Blueprint drafted for runtime API surface.
- [x] 3. Runtime API spec generated and locked in `docs/api-spec.md`.
- [x] 4. Strategic audit documented in `.agent/memory/agent_debate.md`.
- [x] 5. Presentation package prepared for user sign-off.

## Runtime Tasks

| Task ID | Task | Endpoint(s) | Owner | Status |
|:--|:--|:--|:--|:--|
| TB-01 | Public audio transcription for no-login and logged-in flows | `POST /api/transcribe` | Backend | Complete |
| TB-02 | Public estimate generation from notes/images | `POST /api/generate` | Backend | Complete |
| TB-03 | Optional-auth estimate delivery by email with PDF support | `POST /api/send-email` | Backend | Complete |
| TB-04 | Authenticated Stripe payment link creation in tenant connected account | `POST /api/create-payment-link` | Backend | Complete |
| TB-05 | Payment settlement sync from Stripe to estimate status | `POST /api/webhooks/stripe` | Backend | Complete |
| TB-06 | Backfill/reconcile paid Stripe sessions | `GET/POST /api/webhooks/stripe/reconcile` | Backend | Complete |
| TB-07 | Authenticated usage and quota visibility | `GET /api/billing/usage` | Backend | Complete |
| TB-08 | Tenant Stripe Connect onboarding + status + dashboard management | `POST /api/stripe/connect/onboard`, `GET /api/stripe/connect/status`, `POST /api/stripe/connect/dashboard-link` | Backend + Frontend | Complete |
| TB-09 | Authenticated local paid status probe for sent estimates | `GET /api/payments/stripe/status` | Backend + Frontend | Complete |
| TB-14 | SaaS subscription billing (checkout/portal/status + webhook sync) | `POST /api/billing/stripe/checkout`, `POST /api/billing/stripe/portal`, `GET /api/billing/subscription`, `POST /api/webhooks/stripe/billing` | Backend + Frontend | Complete |

## Cross-Checks

- Every runtime task maps to at least one endpoint in `docs/api-spec.md`.
- Public contract endpoints (`transcribe`, `generate`, `send-email`, `create-payment-link`, `payments/stripe/status`, `stripe/connect/*`) match the hotfix contract in Context Bridge section [2].
- Internal payment reliability endpoints (`webhooks/stripe`, `webhooks/stripe/reconcile`) are documented as operational, non-public contract routes.

## Lock Rule

- Spec state: `LOCKED`.
- Rule: no implementation changes without updating `docs/api-spec.md` first.

## Develop Execution (2026-02-20)

- [x] 0. Orchestrator setup: contract check + board init completed.
- [x] 1A. Backend Thread: payment-link idempotency hardening implemented.
- [x] 1B. Frontend Thread: added `/payment-success` route to close Stripe redirect UX gap (no API contract delta).
- [x] 2. Critic reflexion: issue classified and re-audited in `.agent/memory/agent_debate.md`.
- [x] 3. Specialist dispatch: API/Data fix applied and verified by lint + test updates.
- [x] 4. Secretary docs: feature history EN/KR updated.
- [x] 5A. QA guard: regression suite passes on Node 20 after loader/script compatibility fix.
- [x] 5B. CISO external scanner: processed user-provided `npm audit` report and executed dependency patch workflow.

## Fix Loop Init (Orchestrator 4.1)

- Bug focus: dependency security vulnerabilities from `npm audit` (34 issues reported, including high severity items).
- Recommended model: `[HEAVY]` (supply-chain patching across config, dependencies, and client import path).
- Active agents:
  - Orchestrator (bug triage + board state)
  - Lead Dev (reproduction and patch)
  - Security Specialist Dispatch (`vulnerability-scanner`, `api-security-best-practices` equivalent workflow)
  - Critic (regression shield)
  - Secretary (history/findings/daily log)

## Fix Execution (2026-02-20)

- [x] 0. Intelligence setup: audit report classified as Security patch scope.
- [x] 1. Reproduction: red state confirmed from provided `npm audit report`.
- [x] 2. Specialist dispatch (Security):
  - Removed `xlsx` usage from import flow by converting to secure CSV-only parser.
  - Removed `next-pwa` integration and switched to manual service worker registration.
  - Added Next image optimizer mitigation in `next.config.mjs` (`images.unoptimized`, empty `remotePatterns`).
- [x] 3. Critic regression shield: fix reviewed and recorded in `.agent/memory/agent_debate.md`.
- [x] 4. Secretary docs: feature history EN/KR updated, root cause documented in `findings.md`.
- [x] 5A. QA final guard: `npm test` and `npm run lint` green (existing lint warning unchanged).
- [x] 5B. Tracks log: `conductor/tracks.md` updated.

## Develop Execution (2026-02-24) - Guest Paid Reflection Closure

- [x] 0. Contract update first: `docs/api-spec.md` extended with `GET /api/payments/stripe/status`.
- [x] 1A. Backend Thread: implemented Stripe payment status probe route with validation + rate limit.
- [x] 1B. Frontend Thread: persisted `paymentLinkId` in local estimate lifecycle and added history auto-sync (`sent -> paid`).
- [x] 2. Critic reflexion: documented API/Data risk closure in `.agent/memory/agent_debate.md`.
- [x] 3. Specialist dispatch: tests added for new route (`tests/api/stripe-routes.test.mjs`).
- [x] 4. Secretary docs: feature history EN/KR + daily log updated.
- [x] 5A. QA guard: `npm test` and `npm run lint` pass.
- [ ] 5B. Build guard: blocked by pre-existing filesystem symlink loop (`ELOOP: GEMINI.md`), outside patch scope.

## Develop Execution (2026-02-24) - Stripe Connect Tenant Ownership

- [x] 0. Contract update first: auth/payment model updated in `docs/api-spec.md` (Connect endpoints + auth requirement changes).
- [x] 1A. Backend Thread: implemented Stripe Connect onboarding/status/dashboard-link routes.
- [x] 1B. Backend Thread: migrated payment-link route to authenticated tenant connected-account creation (`stripeAccount`).
- [x] 2. Frontend Thread: added Stripe Connect management UI on profile and linked payment-link UX error guidance.
- [x] 3. Critic reflexion: recorded architecture correction and risk closure in `.agent/memory/agent_debate.md`.
- [x] 4. Specialist dispatch: expanded mocks/tests for Connect + payment constraints (`tests/api/stripe-connect-routes.test.mjs`, `tests/api/core-workflow-routes.test.mjs`).
- [x] 5A. QA guard: `npm test` and `npm run lint` pass (one pre-existing lint warning remains).
- [x] 5B. Build guard: `ELOOP` blocker resolved on 2026-02-25 (see TB-11 execution).

## Architecture V2 Init (Orchestrator 4.1)

- Project: SnapQuote V2 (The Lazy Capture Expansion & System Hardening)
- Focus: Gemini Multimodal AI Integration, Sync Resilience, CI/CD Fixes, Comms Monetization.
- Recommended model: `[HEAVY]` (architecture contract planning + system scope updates).
- Active agents:
  - Orchestrator (contract and board control)
  - Architect (runtime API contract expansion)
  - Critic (strategic audit and risk screening)
  - Secretary (history + daily log updates)

### Runtime Tasks (V2)

| Task ID | Task | Endpoint(s) | Owner | Status |
|:--|:--|:--|:--|:--|
| TB-10 | Gemini API integration for multimodal "Capture First" parsing | `POST /api/generate` (Switch engine) | Backend | Pending |
| TB-11 | CI/CD ELOOP build fix (`GEMINI.md` symlink cleanup) | N/A (Build Config) | DevOps | Complete |
| TB-12 | Conflict-Free Replicated Data Type (CRDT) for offline sync | `POST /api/sync/crdt` (New) | Backend | Pending |
| TB-13 | SMS monetization strategy shift (Email primary, Twilio Pay-as-you-go) | `POST /api/send-sms` (New/Premium) | Backend | Pending |
| TB-14 | SaaS subscription billing for service monetization | `POST /api/billing/stripe/checkout`, `POST /api/billing/stripe/portal`, `GET /api/billing/subscription`, `POST /api/webhooks/stripe/billing` | Backend + Frontend | Complete |

## Launch Execution (2026-02-25) - Architecture V2 Planning

- [x] 0. Intelligence setup: architecture complexity classified as `[HEAVY]`.
- [x] 1. Goal alignment: `conductor/product.md` and `conductor/tech-stack.md` validated for V2 scope.
- [x] 2. Blueprinting: V2 tasks (`TB-10` to `TB-13`) documented in runtime board.
- [x] 3. Runtime API spec: `docs/api-spec.md` updated and locked with V2 endpoint surface.
- [x] 4. Critic audit: strategic risks and constraints documented in `.agent/memory/agent_debate.md`.
- [ ] 5. Final sign-off: pending user approval on V2 launch plan.

## V2 Cross-Checks

- Every V2 task (`TB-10` to `TB-13`) maps to at least one endpoint or ops scope in `docs/api-spec.md`.
- V2 additions preserve lock rule: implementation must follow contract updates first.

## Develop Execution (2026-02-25) - TB-11 Build Guard Recovery

- [x] 0. Reproduction: `next build` failed with `ELOOP` on workspace-root `GEMINI.md` symlink.
- [x] 1. Build Config fix: replaced looping symlink with regular `GEMINI.md` file.
- [x] 2. Type gate fix: aligned Supabase helper typing in `lib/server/stripe-connect.ts` to restore production type-check path.
- [x] 3. Scope gate fix: excluded non-runtime skill workspace (`codex`, `.agent`) from `tsconfig.json` build type scope.
- [x] 4. Frontend SSR gate: removed `useSearchParams` reliance from `/login` and `/new-estimate` to satisfy static prerender constraints.
- [x] 5A. QA guard: `npm run lint` and `npm test -- --runInBand` pass (single pre-existing lint warning unchanged).
- [x] 5B. Build guard: `npm run build` passes successfully.

## Develop Execution (2026-02-25) - TB-14 SaaS Subscription Billing

- [x] 0. Contract update first: `docs/api-spec.md` extended with Stripe Billing SaaS endpoints and webhook contract.
- [x] 1A. Backend Thread: implemented billing routes (`/api/billing/stripe/checkout`, `/api/billing/stripe/portal`, `/api/billing/subscription`).
- [x] 1B. Backend Thread: implemented billing webhook route (`/api/webhooks/stripe/billing`) with plan-tier synchronization.
- [x] 2. Database Thread: added profile billing columns migration (`supabase/migrations/20260225150000_add_stripe_billing_to_profiles.sql`).
- [x] 3. Frontend Thread: connected `/pricing` upgrade CTA to Stripe Checkout and billing management portal flow.
- [x] 4. Specialist dispatch: expanded Stripe mocks and added API tests (`tests/api/billing-subscription-routes.test.mjs`).
- [x] 5A. QA guard: `npm run lint` and `npm test -- --runInBand` pass (single pre-existing lint warning unchanged).
- [x] 5B. Build guard: `npm run build` passes with new billing routes included.
