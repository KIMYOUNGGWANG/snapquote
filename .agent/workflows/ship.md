---
description: Autonomous Deployment & PR (Orchestrator 3.0)
---

# 🚢 Ship (Agentic Engine v3.0)

Final quality gate with context pruning and bilingual documentation.

## 0. [AGENT] Orchestrator: Intelligence Setup
- [ ] **Model Router**: Ship tasks are `[HEAVY]` → Recommend Pro/Sonnet.
- [ ] **Skill Discovery**: Auto-load `vulnerability-scanner`, `create-pr`.

## 1. [AGENT] CISO: Security Guard
- [ ] **Scan**: Execute `vulnerability-scanner` on all new code.
- [ ] **Audit**: Verify data exposure and API key safety.

## 2. [AGENT] QA: Stability Guard
- [ ] **Test**: Run full test suite using `test-automator`.
- [ ] **Regression**: Check `progress.md` for known past issues.

## 3. [AGENT] Critic: Final Review
- [ ] **Debate**: Record final quality assessment in `.agent/memory/agent_debate.md` (IN ENGLISH).
- [ ] **Verdict**: SHIP or ABORT.

## 4. [AGENT] Secretary: Bilingual Documentation
- [ ] **PR**: Generate internal PR summary using `create-pr` skill.
- [ ] **History (EN)**: Append final feature record to `.agent/memory/feature_history_en.md` with Git Commit Hash.
- [ ] **History (KR)**: Append final feature record to `.agent/memory/feature_history_kr.md` with Git Commit Hash.
- [ ] **Sync**: Update `conductor/tracks.md`.

## 5. [AGENT] Archivist: Context Pruning
- [ ] **Archive**: Move current `task_board.md` to `.agent/memory/archives/YYYY-MM-DD.md`.
- [ ] **Archive Debate**: Move current `agent_debate.md` to `.agent/memory/archives/debate-YYYY-MM-DD.md`.
- [ ] **Reset**: Create fresh `task_board.md` for next session.
- [ ] **Retain**: Keep `feature_history_en.md` and `feature_history_kr.md` as permanent knowledge.

## 6. [AGENT] Orchestrator: Deployment
- [ ] **Execute**: Merge or push code.
- [ ] **Report**: Notify user in Korean with summary of all changes.

---
> [!CAUTION]
> If ANY CISO or QA check fails, the Orchestrator will ABORT the ship process.
> Context Pruning ensures the next session starts with a clean, efficient memory.
