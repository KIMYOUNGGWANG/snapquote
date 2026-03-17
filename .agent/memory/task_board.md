# 📋 Task Board

## [ ] Backlog
- [ ] TB-16 Implement `/api/pricing/dynamic/calculate` runtime and tests to close the locked contract gap. <!-- id: 0 -->
- [ ] SQ-01 Implement sub-quote request, guest submit, and status flows for `/api/sub-quotes/*`. <!-- id: 1 -->
- [ ] OPS-02 Add launch operations assets: `support@snapquote.app`, status page, and backup/disaster recovery runbook. <!-- id: 2 -->
- [ ] LEG-01 Replace placeholder legal copy with reviewed Privacy Policy, Terms of Service, and GDPR/CCPA checklist. <!-- id: 3 -->
- [ ] UX-02 Add first-quote tutorial/demo quote and expand Setup Wizard for logo and price-list onboarding. <!-- id: 4 -->
- [ ] GTM-01 Refresh landing and pricing messaging around "Quote before you drive off" and tighten beta lead capture. <!-- id: 5 -->
- [ ] DATA-01 Define supplier pricing, benchmark data, and retention moat roadmap before Phase 3 build starts. <!-- id: 6 -->

## [ ] In Progress

## [ ] Done
- [x] TB-01 Voice transcription runtime shipped via `POST /api/transcribe`. <!-- id: 10 -->
- [x] TB-02 AI estimate generation shipped with Gemini/OpenAI runtime via `POST /api/generate`. <!-- id: 11 -->
- [x] TB-03 Estimate email delivery runtime and UI shipped via `POST /api/send-email` and `components/email-modal.tsx`. <!-- id: 12 -->
- [x] TB-04 Quote payment-link creation shipped via `POST /api/create-payment-link`. <!-- id: 13 -->
- [x] TB-05 and TB-06 Stripe settlement and reconcile flows shipped via `/api/webhooks/stripe*`. <!-- id: 14 -->
- [x] TB-07 and TB-14 SaaS billing usage, checkout, portal, subscription, and billing webhook flows shipped. <!-- id: 15 -->
- [x] TB-08 and TB-09 Stripe Connect onboarding, status, dashboard link, and payment status sync shipped. <!-- id: 16 -->
- [x] TB-10 Gemini-capable generate runtime is active in the quote pipeline. <!-- id: 17 -->
- [x] TB-12 Offline sync runtime shipped via `POST /api/sync/crdt`. <!-- id: 18 -->
- [x] TB-13 Premium SMS runtime and UI shipped via `POST /api/send-sms` and `components/sms-modal.tsx`. <!-- id: 19 -->
- [x] TB-15 Quote Recovery trigger runtime shipped via `POST /api/quotes/recovery/trigger`. <!-- id: 20 -->
- [x] TB-17 Supabase OAuth callback flow shipped in `app/auth/callback/page.tsx`. <!-- id: 21 -->
- [x] TB-18 Feedback widget and API shipped via `components/feedback-modal.tsx` and `POST /api/feedback`. <!-- id: 22 -->
- [x] TB-22 Receipt parsing runtime and UI shipped via `POST /api/parse-receipt` and `components/receipt-scanner.tsx`. <!-- id: 23 -->
- [x] TB-23 Public receipt lead-gen path shipped via `POST /api/public/parse-receipt` and `POST /api/public/capture-lead`. <!-- id: 24 -->
- [x] SEO-3 and SEO-4 discoverability routes shipped in `app/sitemap.ts` and `app/robots.ts`. <!-- id: 25 -->
- [x] Core launch path is live: PWA install/offline UX, PDF export, history view, and payment-status polling. <!-- id: 26 -->
- [x] OPS-01 Branch lint regression fixed in `components/setup-wizard.tsx` and `npm run lint` is green again. <!-- id: 7 -->
- [x] PM-01 `docs/MARKET_READINESS_ROADMAP.md` checkboxes were reconciled with shipped runtime status. <!-- id: 9 -->
- [x] QA-01 Playwright coverage for estimate, email, SMS, payment-link, offline, landing, login, pricing, and history flows is passing locally. <!-- id: 8 -->
- [x] OPS-03 Created `docs/manual-launch-checklist.md` for live beta/public launch verification. <!-- id: 32 -->
- [x] OPS-04 Created `docs/today-beta-pass-runbook.md` with exact command and click order for the first live beta decision pass. <!-- id: 33 -->

## [ ] Verification
- [x] `npm test` passes on the current branch. <!-- id: 27 -->
- [x] `npm run lint` passes after the Setup Wizard copy fix. <!-- id: 28 -->
- [x] `npm run test:e2e` passes locally on the current branch. <!-- id: 29 -->
- [ ] Manual launch checklist in `docs/manual-launch-checklist.md` passes for email, SMS, Stripe Connect, payment completion, receipt scan, and feedback submit. <!-- id: 30 -->
- [x] Contract audit scoped `/api/pricing/dynamic/calculate` and `/api/sub-quotes/*` out of the locked runtime and documented them in the appendix of `docs/api-spec.md`. <!-- id: 31 -->
