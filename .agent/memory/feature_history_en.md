# Feature History (English)

## 2026-02-16: UI/UX Overhaul + Marketing + Performance Optimization

### Changes
1. **Premium Theme:** Deep Navy (#0a0a0f) + Glassmorphism applied globally
2. **Navigation:** Floating glass BottomNav + "More" menu drawer (`components/more-menu.tsx`)
3. **Onboarding:** Voice Cheat Sheet (Practice Mode) + Tutorial restart via Help button
4. **Landing Page:** `/landing` route with hero, features, pricing, testimonials
5. **Marketing Assets:** Generated promotional video + 3 key marketing images
6. **Performance:** Dynamic imports reduced `/new-estimate` by 77% (825→189 KB) and `/history` by 75% (661→164 KB)
7. **Build Fix:** Removed broken `GEMINI.md` symlink causing ELOOP error

### Quality Gates
- Lint: ✅ 0 errors
- Security: ✅ No exposed keys
- Build: ✅ 30 pages generated
