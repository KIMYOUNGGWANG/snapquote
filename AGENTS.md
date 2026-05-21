# AGENTS.md — SnapQuote Agent Context

## Product Mission
- SnapQuote is a field-first AI estimator for owner-operators and small trade crews.
- Core promise: turn rough field notes, photos, or voice recordings into professional customer-ready estimates before the contractor leaves the jobsite.
- Prioritize quote capture, offline reliability, PDF delivery, payment links, and follow-up workflows.

## Development Harness
- This project uses OpenCode with `oh-my-openagent` as the preferred agent harness.
- Local project configuration lives in `.opencode/oh-my-openagent.jsonc`.
- Use `ultrawork` for implementation tasks and Prometheus/plan mode for risky refactors.
- Current provider set: OpenAI + Gemini only. Do not assume Claude, Copilot, Kimi, Z.ai, OpenCode Go, or Vercel AI Gateway access.

## Tech Stack
- Frontend: Next.js 16 App Router, React 18, TypeScript, Tailwind CSS
- UI: local shadcn-style primitives, lucide-react, mobile-first PWA shell
- Local-first data: IndexedDB via `idb`, service worker, offline sync helpers
- Backend: Supabase Auth, Postgres, RLS, Edge Functions
- AI: OpenAI primary, Gemini optional fallback for generation and visual/frontend work
- Payments and delivery: Stripe, Stripe Connect, Resend, optional Twilio
- Documents: `@react-pdf/renderer`

## Repo Boundaries
- Treat SnapQuote as the primary app.
- Do not edit `inkdesk/` unless the user explicitly asks; it is a separate app currently inside the repo and can break root build/type checks.
- Avoid resurrecting legacy Orchestrator 5.x files, symlinks, commands, or memory folders.
- Keep hidden agent config minimal: prefer `.opencode/` plus this file.

## Engineering Rules
- Follow the existing codebase patterns before introducing new architecture.
- Keep changes focused and reversible; avoid broad rewrites unless the task is explicitly a refactor.
- Prefer Server Components by default, but respect existing client-heavy flows where browser APIs, IndexedDB, audio, camera, or local state are required.
- Validate external input with Zod or existing schema helpers.
- Avoid `any` in new code. When touching legacy `any`, narrow it if the change is already in scope.
- Use descriptive names; avoid abbreviations such as `req` or `res` in new code.
- Add comments only for non-obvious logic.

## Verification
- For API/server changes, run `npm test`.
- For UI changes, run targeted Playwright tests or manually verify the changed page when practical.
- For build readiness, remember root build is sensitive to `inkdesk/` inclusion; fix project boundaries before treating build failures as SnapQuote app failures.
- Do not claim production readiness without evidence from lint/test/build or a clear note about what could not be run.

## Communication
- User-facing summaries should be in Korean.
- Be concise, explicit about changed files, and call out blocked verification clearly.
