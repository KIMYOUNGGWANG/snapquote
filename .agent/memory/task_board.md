# Task Board (In Progress)

## Active Missions
- DEV-2026-03-08A: Align public marketing surfaces to the residential plumbing owner-operator ICP and close SEO/receipt-warning regressions.

## Recommended Model
- `[HEAVY]` for mixed frontend UX, SEO metadata, and state-flow regression work.

## Assigned Agents
- Codex: implement marketing positioning alignment, receipt-warning UX fix, and SEO cleanup.

## Tasks
| ID | Area | Endpoint | Flow | Status |
|:--|:--|:--|:--|:--|
| MKT-01 | Marketing | `/landing` | Plumbing ICP hero, proof, testimonials, CTA alignment | Complete |
| MKT-02 | Marketing | `/pricing` | Plumbing ICP pricing copy and plan framing alignment | Complete |
| MKT-03 | Marketing | `/` | Public home/dashboard hero alignment for plumbing ICP | Complete |
| SEO-05 | Discoverability | `/sitemap.xml`, `/robots.txt` | Canonical/robots hardening for public vs private routes | Complete |
| UX-22 | Estimate UX | `POST /api/parse-receipt` consumer flow | Preserve and surface parser warnings in estimate review | Complete |

## Verification
- `npx eslint app/layout.tsx app/robots.ts components/receipt-scanner.tsx app/new-estimate/page.tsx app/landing/page.tsx app/landing/layout.tsx app/page.tsx app/pricing/page.tsx app/pricing/layout.tsx`
- `npm test`

## Next Candidates
- Unify screenshots and testimonials with plumbing-specific assets.
- Repair `.agent/scripts/smart-skill-loader.sh` `--concat` failure before the next orchestrated run.
