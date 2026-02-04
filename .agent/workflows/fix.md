---
description: Debugging and bug fixing (Fix Phase)
---

# 🚑 Fix Workflow

Use this workflow when something is broken.

## 1. Diagnosis (`debugging-strategies`)
- [ ] **Reproduce**: Create a reproduction script or test case that demonstrates the bug.
- [ ] **Analyze**: Read logs, stack traces, and use `error-analysis` skill.
- [ ] **Log**: Write findings to `findings.md` (don't trust your memory).

## 2. Correction (`test-driven-development`)
- [ ] **Test**: Ensure the reproduction test fails (RED).
- [ ] **Fix**: Apply the fix.
- [ ] **Verify**: Ensure the test passes (GREEN) and no regressions occurred.

## 3. Prevention
- [ ] **Reflect**: Add a note to `progress.md` about why this happened to avoid repeating it.
