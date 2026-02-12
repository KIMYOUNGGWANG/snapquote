---
description: Autonomous Debugging & Patching (Orchestrator 3.0)
---

# 🚑 Fix (Agentic Engine v3.0)

Systematic autonomous debugging with auto-skill detection and transparent agent debate.

## 0. [AGENT] Orchestrator: Intelligence Setup
- [ ] **Model Router**: Analyze bug complexity.
    - `[LIGHT]` → Simple typo, config error → Flash.
    - `[HEAVY]` → Deep logic bug, race condition → Pro/Sonnet.
- [ ] **Skill Discovery**: Scan error logs for tech signals and auto-load relevant skills (e.g., `nextjs-supabase-auth` for Supabase errors).
- [ ] **Board Init**: Update `.agent/memory/task_board.md` with bug report details.

## 1. [AGENT] Lead Dev: Reproduction
- [ ] **Red Test**: Create a reproduction script that *fails* consistently.
- [ ] **Trace**: Analyze logs using `systematic-debugging` and `logging-debugging-patterns`.

## 2. [AGENT] Lead Dev: Patching
- [ ] **Fix**: Apply minimal logic change to make the test pass.
- [ ] **Refine**: Ensure fix follows `clean-code` standards.

## 3. [AGENT] Critic: Regression Shield
- [ ] **Audit**: Verify fix against known side effects.
- [ ] **Debate**: Record review in `.agent/memory/agent_debate.md` (IN ENGLISH).
- [ ] **Verdict**: Is this a "band-aid" or a proper fix? If band-aid, reject.

## 4. [AGENT] Secretary: Documentation
- [ ] **History (EN)**: Append bug fix record to `.agent/memory/feature_history_en.md`.
- [ ] **History (KR)**: Append bug fix record to `.agent/memory/feature_history_kr.md`.
- [ ] **Root Cause**: Document the root cause in `findings.md`.

## 5. [AGENT] QA: Final Guard
- [ ] **Pass**: Verify all tests are GREEN.
- [ ] **Log**: Update `conductor/tracks.md`.

---
> [!IMPORTANT]
> **Language Protocol**: Agent debate = English. User reports = Korean.
