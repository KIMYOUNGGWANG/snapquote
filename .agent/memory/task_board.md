# Task Board: Estimate Generation & Delivery Runtime

- Project: SnapQuote
- Version: v1.1 (Hotfix)
- Date: 2026-02-20
- Status: V1 complete; V2 core API rollout complete (TB-10/TB-12/TB-13/TB-18); V3 TB-15/TB-17/TB-19/TB-20 complete (TB-16 backlog)

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
- [x] 5B. Build guard: blocker resolved on 2026-02-25 via TB-11 recovery (historical note retained).

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
| TB-10 | Gemini API integration for multimodal "Capture First" parsing | `POST /api/generate` (Switch engine) | Backend | Complete |
| TB-11 | CI/CD ELOOP build fix (`GEMINI.md` symlink cleanup) | N/A (Build Config) | DevOps | Complete |
| TB-12 | Conflict-Free Replicated Data Type (CRDT) for offline sync | `POST /api/sync/crdt` (New) | Backend | Complete |
| TB-13 | SMS monetization strategy shift (Email primary, Twilio Pay-as-you-go) | `POST /api/send-sms` (New/Premium) | Backend | Complete |
| TB-18 | In-app feedback capture API + widget wiring | `POST /api/feedback` (New) | Backend + Frontend | Complete |
| TB-14 | SaaS subscription billing for service monetization | `POST /api/billing/stripe/checkout`, `POST /api/billing/stripe/portal`, `GET /api/billing/subscription`, `POST /api/webhooks/stripe/billing` | Backend + Frontend | Complete |

## Launch Execution (2026-02-25) - Architecture V2 Planning

- [x] 0. Intelligence setup: architecture complexity classified as `[HEAVY]`.
- [x] 1. Goal alignment: `conductor/product.md` and `conductor/tech-stack.md` validated for V2 scope.
- [x] 2. Blueprinting: V2 tasks (`TB-10` to `TB-13`) documented in runtime board.
- [x] 3. Runtime API spec: `docs/api-spec.md` updated and locked with V2 endpoint surface.
- [x] 4. Critic audit: strategic risks and constraints documented in `.agent/memory/agent_debate.md`.
- [x] 5. Final sign-off: user approval received on 2026-02-27; implementation sequence unlocked.

## V2 Execution Queue (Post Sign-off)

- Priority lock:
  - 1) TB-10 (`POST /api/generate` Gemini engine switch)
  - 2) TB-12 (`POST /api/sync/crdt`)
  - 3) TB-13 (`POST /api/send-sms`)
- Execution result (2026-02-28):
  - TB-10 complete
  - TB-12 complete
  - TB-13 complete
- Constraint: `docs/api-spec.md` remains `LOCKED`; any contract delta must be updated first.

## Develop Execution (2026-02-27) - V2 Final Sign-off Closure

- [x] 0. Contract check: confirmed `docs/api-spec.md` exists and remains `LOCKED`.
- [x] 1. Board control: closed pending V2 final sign-off gate and synchronized stale unresolved marker.
- [x] 2. Critic reflexion: recorded governance closure verdict in `.agent/memory/agent_debate.md`.
- [x] 3. Secretary docs: appended records to `feature_history_en.md`, `feature_history_kr.md`, and daily log.
- [x] 4A. QA guard: `npm run lint` pass (one pre-existing warning), `npm test` pass (58/58).
- [x] 4B. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`); fallback static scan showed no hardcoded secret/eval/DOM-injection patterns in runtime paths.

## V2 Cross-Checks

- Every V2 task (`TB-10` to `TB-13`, `TB-18`) maps to at least one endpoint or ops scope in `docs/api-spec.md`.
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

## Architecture V3 Init (Orchestrator 4.1)

- Project: SnapQuote V3 (Painkiller Upsells Expansion)
- Focus: Quote Recovery Copilot (Pro) and Dynamic Pricing Engine (Enterprise).
- Recommended model: `[HEAVY]` (architecture contract planning + system scope updates).
- Active agents:
  - Orchestrator (contract and board control)
  - Architect (runtime API contract expansion)
  - Critic (strategic audit and risk screening)
  - Secretary (history + daily log updates)

### Runtime Tasks (V3)

| Task ID | Task | Endpoint(s) | Owner | Status |
|:--|:--|:--|:--|:--|
| TB-10 | Gemini Multimodal Expansion (Images + Voice) | `POST /api/generate` | Fullstack | Complete |
| TB-15 | Quote Recovery Copilot logic and cron queue | `POST /api/quotes/recovery/trigger` | Backend | Complete |
| TB-16 | Dynamic Pricing Engine markup and rule evaluation | `POST /api/pricing/dynamic/calculate` | Backend | Backlog |
| TB-17 | Social Login (Google/Apple) & 3-Step Setup Wizard | `GET /auth/callback` | Fullstack | Complete |
| TB-18 | In-App Feedback & Bug Reporting Widget | `POST /api/feedback` | Fullstack | Complete |
| TB-19 | Good-Better-Best Generator (Auto-Upsell) | `POST /api/generate` | AI/Backend | Complete |
| TB-20 | Auth Redirect & Sync Reliability Overhaul | N/A (Client Runtime) | Fullstack | Complete |

## Develop Execution (2026-03-01) - TB-20 Auth Redirect & Sync Reliability

- [x] 0. Strategy Selection: implemented "Force-Reload" strategy for 100% reliable auth transitions.
- [x] 1A. Frontend Thread: created `AuthRedirectManager` and integrated into root `layout.tsx`.
- [x] 1B. Frontend Thread: updated `useAuthGuard` and `SyncManager` to remove fragmented listeners and use `window.location.href`.
- [x] 2A. Database Thread: updated IndexedDB schema and `LocalEstimate` typing to include `updatedAt`.
- [x] 2B. Sync Thread: refactored `syncEstimates` logic to use "Last Write Wins" via `updatedAt` metadata comparison.
- [x] 3. Critic reflexion: documented choice of `window.location.href` vs client-side routing in `.agent/memory/agent_debate.md`.
- [x] 4. Secretary docs: updated `docs/api-spec.md` with Global Auth Management section.
- [x] 5A. QA guard: verified login/logout flow across protected routes and reran full regression (`npm test` 85/85, `npm run lint` pass).
- [x] 5B. Build guard: `npm run build` pass after `updatedAt` type regression fix in `app/new-estimate/page.tsx`.
- [ ] 5C. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`) in current environment; fallback static scan showed no `eval`/`new Function`/`dangerouslySetInnerHTML` usage in runtime paths.

## Develop Execution (2026-02-28) - Mission Revalidation (Duplicate Payment-Link Risk + Final Guard)

- [x] 0. Orchestrator Step-0 rerun: contract check (`docs/api-spec.md`) and mission context scan completed under locked spec.
- [x] 1. API/Data critic re-check: confirmed `POST /api/create-payment-link` idempotency behavior and tests remain intact (deterministic default + client header override).
- [x] 2A. QA guard: full regression rerun `npm test` pass (85/85), `npm run lint` pass (0 warnings/errors).
- [x] 2B. Build guard: `npm run build` pass after fixing `LocalEstimate.updatedAt` payload omission in `app/new-estimate/page.tsx`.
- [ ] 2C. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`); fallback static scan completed with no dynamic-code injection patterns detected.
## Develop Execution (2026-02-27) - TB-17 Social Login (Google PKCE)

- [x] 0. Contract check: confirmed `GET /auth/callback` exists in locked `docs/api-spec.md` (no contract delta required).
- [x] 1A. Frontend Thread: added social auth entry point on `/login` with Google OAuth dispatch and callback redirect wiring.
- [x] 1B. Fullstack Thread: implemented `app/auth/callback/page.tsx` to exchange PKCE code, sanitize redirect targets, and propagate OAuth errors safely to login.
- [x] 2. Specialist dispatch (API/Data + Security hygiene): extracted shared callback normalization helpers in `lib/auth/oauth-callback.ts` (next path / intent / error normalization).
- [x] 3. Verification: added tests `tests/api/oauth-callback-utils.test.mjs`; `npm test` pass (63/63), `npm run lint` pass (one pre-existing warning unchanged).
- [x] 4. Build guard: rerun on 2026-02-28 passes after replacing root `GEMINI.md` symlink with a regular file.

## Develop Execution (2026-02-28) - TB-17 Setup Wizard & Apple Login
- [x] 1. Re-added Apple Login to `app/login/page.tsx`.
- [x] 2. Built `components/setup-wizard.tsx` to collect `business_name` and `default_tax_rate` upon first login.
- [x] 3. Conditionally rendered the wizard in `app/page.tsx` replacing the main dashboard until profile completion.
- [x] 4. Resolved TypeScript and strict null check errors.

~~## Scope Adjustment (2026-02-28) - TB-17 Apple Login Removal~~
~~- [x] Product decision: removed Apple OAuth sign-in and retained Google OAuth + magic link flow.~~
~~- [x] Contract sync: `/auth/callback` description updated to Google-only OAuth PKCE handling in `docs/api-spec.md`.~~
~~- [x] Frontend sync: removed Apple button/provider dispatch from `app/login/page.tsx`.~~
~~- [x] Verification: regression (`npm test`) and lint (`npm run lint`) pass.~~

## Develop Execution (2026-02-28) - TB-12 CRDT Sync Endpoint

- [x] 0. Contract check: confirmed `POST /api/sync/crdt` exists in locked `docs/api-spec.md` (no contract delta required).
- [x] 1A. Backend Thread: implemented `app/api/sync/crdt/route.ts` with auth guard, payload validation, dedup merge, and upsert to `sync_change_log`.
- [x] 1B. Database Thread: added migration `supabase/migrations/20260228100000_add_sync_change_log_and_feedback_metadata.sql` for `sync_change_log` + indexes + RLS.
- [x] 2. Specialist dispatch (API/Data): added deterministic merge/upsert tests in `tests/api/sync-and-feedback-routes.test.mjs`.
- [x] 3. Verification: `npm test` pass (71/71), `npm run lint` pass (single pre-existing warning unchanged).
- [x] 4. Build guard: `npm run build` passes after workspace-root `GEMINI.md` symlink cleanup.

## Develop Execution (2026-02-28) - TB-18 Feedback API + Widget Wiring

- [x] 0. Contract check: confirmed `POST /api/feedback` exists in locked `docs/api-spec.md` (no contract delta required).
- [x] 1A. Backend Thread: implemented `app/api/feedback/route.ts` with optional auth, payload validation, and IP rate limit.
- [x] 1B. Frontend Thread: rewired `components/feedback-modal.tsx` to call `/api/feedback` instead of direct client-side table insert.
- [x] 2. Database Thread: extended `feedback` table with `metadata jsonb` in migration `20260228100000_add_sync_change_log_and_feedback_metadata.sql`.
- [x] 3. Specialist dispatch (API/Data + Security hygiene): added route coverage for guest/auth/rate-limit paths in `tests/api/sync-and-feedback-routes.test.mjs`.
- [x] 4. Verification: `npm test` pass (71/71), `npm run lint` pass (single pre-existing warning unchanged).
- [x] 5A. Build guard: `npm run build` passes after workspace-root `GEMINI.md` symlink cleanup.
- [ ] 5B. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## Develop Execution (2026-02-28) - TB-10 Gemini Engine Switch (`POST /api/generate`)

- [x] 0. Contract check: confirmed `POST /api/generate` remains contract-compatible (response schema unchanged).
- [x] 1A. Backend Thread: switched runtime generation to Gemini-first strategy (`GEMINI_API_KEY` present) with OpenAI fallback path for compatibility.
- [x] 1B. Backend Thread: added Gemini response parsing + usage token extraction while preserving existing estimate normalization and quota recording flow.
- [x] 2. Specialist dispatch (API/Data): extended tests to cover Gemini provider path while preserving OpenAI mock path.
- [x] 3. Verification: `npm test` pass (77/77), `npm run lint` pass (single pre-existing warning unchanged), `npm run build` pass.
- [ ] 4. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## Develop Execution (2026-02-28) - TB-13 SMS Delivery API (`POST /api/send-sms`)

- [x] 0. Contract check: confirmed `POST /api/send-sms` exists in locked `docs/api-spec.md`.
- [x] 1A. Backend Thread: implemented `app/api/send-sms/route.ts` with auth, validation, rate limit, credit balance check, and Twilio provider dispatch.
- [x] 1B. Backend Thread: persisted send records to `sms_messages` and ledger deduction to `sms_credit_ledger` on successful provider response.
- [x] 2. Specialist dispatch (API/Data): added route tests for unauthorized/invalid/insufficient-credit/rate-limit/success paths in `tests/api/send-sms-routes.test.mjs`.
- [x] 3. Verification: `npm test` pass (77/77), `npm run lint` pass (single pre-existing warning unchanged), `npm run build` pass.
- [ ] 4. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## Develop Execution (2026-02-28) - TB-15 Quote Recovery Copilot

- [x] 0. Contract check: confirmed `POST /api/quotes/recovery/trigger` exists in locked `docs/api-spec.md` (no contract delta required).
- [x] 1A. Backend Thread: implemented `app/api/quotes/recovery/trigger/route.ts` with 48h candidate scan, claim lock (`first_followup_queued_at`), and Gemini-first follow-up message generation.
- [x] 1B. Backend Thread: integrated delivery dispatch by channel (Twilio SMS with credit gating, Resend email fallback, `skipped_no_contact` path).
- [x] 2. Database Thread: no schema delta required; reused existing follow-up tracking columns (`sent_at`, `first_followup_queued_at`, `first_followed_up_at`, `last_followed_up_at`).
- [x] 3. Specialist dispatch (API/Data): added route tests in `tests/api/quote-recovery-routes.test.mjs` for auth/plan-tier/dryRun/sms/email/cron/rate-limit paths.
- [x] 4A. QA guard: `npm test` pass (85/85), `npm run lint` pass (0 warnings/errors).
- [x] 4B. Build guard: `npm run build` pass.
- [ ] 4C. CISO guard: `npm audit` blocked by network DNS (`ENOTFOUND registry.npmjs.org`) in current environment.

## Develop Execution (2026-03-01) - TB-19 Auto-Upsell Generator

- [x] 0. Contract check: verified `POST /api/generate` includes `upsellOptions` in `docs/api-spec.md`.
- [x] 1A. AI Thread: updated Gemini/OpenAI generation prompt in `app/api/generate/route.ts` to generate `better` and `best` upsell options.
- [x] 1B. AI Thread: structured output normalization enforces `upsellOptions` shape (`tier/title/description/addedItems`) with empty-item filtering.
- [x] 2A. Frontend Thread: updated `app/new-estimate/page.tsx` to parse/render auto-upsell packages and allow one-click package apply into estimate items.
- [x] 2B. Data Thread: extended local estimate typing in `lib/estimates-storage.ts` and persisted optional `upsellOptions` in draft/sent payload.
- [x] 3. Specialist dispatch (API/Data): updated `tests/api/core-workflow-routes.test.mjs` to verify upsell normalization (`tier` fallback + empty package filtering).
- [x] 4A. QA guard: `npm test` pass (85/85), `npm run lint` pass (0 warnings/errors), `npm run build` pass.
- [ ] 4B. CISO guard: `npm audit` blocked by DNS (`ENOTFOUND registry.npmjs.org`) in current environment; fallback static scan found no `eval`/`new Function`/`dangerouslySetInnerHTML` usage in TB-19 touched files.

## Fix Execution (2026-02-28) - Dependency Advisory Mitigation (`ajv`, `glob`, `minimatch`, `qs`, `next`)

- [x] 0. Intelligence setup: classified as Security/Supply-chain patch scope from user-provided audit advisories.
- [x] 1A. Mitigation patch: added non-breaking `package.json` `overrides` for transitive paths:
  - `@next/eslint-plugin-next` -> `glob`, `minimatch`
  - `@typescript-eslint/typescript-estree` -> `minimatch`
  - `eslint` -> `minimatch`
  - `stripe` -> `qs`
- [ ] 1B. Dependency resolution apply: `npm install --package-lock-only` blocked by DNS (`ENOTFOUND registry.npmjs.org`), so lockfile upgrade is pending network-enabled environment.
- [x] 2A. QA guard: `npm test` pass (85/85), `npm run lint` pass (0 warnings/errors), `npm run build` pass.
- [ ] 2B. CISO guard: `npm audit` blocked by DNS (`ENOTFOUND registry.npmjs.org`) in current environment.
- [x] 3. Risk note:
  - `next` advisory patch path requires major upgrade to Next 16 (`npm audit fix --force`), not auto-applied in this bounded pass.
  - `ajv` advisory path remains transitive via current lint toolchain; requires network-enabled dependency re-resolution and potential major upgrade track.

## Fix Execution (2026-02-28) - Dependency Advisory Full Closure (`ajv`, `glob`, `minimatch`, `qs`, `next`)

- [x] 0. Security triage: confirmed remaining blocker was `next` high advisory requiring breaking upgrade path.
- [x] 1A. Patch apply: executed `npm audit fix --force` and upgraded framework stack (`next@16.1.6`).
- [x] 1B. Compatibility hardening:
  - removed unsupported `experimental.esmExternals` from `next.config.mjs`
  - migrated lint command from `next lint` to `eslint .`
  - upgraded lint stack (`eslint@9`, `eslint-config-next@16`) and added focused rule overrides in `eslint.config.mjs`.
- [x] 2A. QA guard: `npm test` pass (85/85), `npm run lint` pass (warnings only, no errors).
- [x] 2B. Build guard: `npm run build` pass (validated in elevated environment due sandbox Turbopack process/port constraint).
- [x] 2C. CISO guard: `npm audit --omit=dev` pass (0 vulnerabilities).
- [x] 3. Resolution status:
  - User-reported advisory set closed at dependency level.
  - Remaining follow-up is quality debt cleanup for lint warnings (non-blocking).
