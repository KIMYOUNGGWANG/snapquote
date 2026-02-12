---
description: Autonomous Development Loop (Orchestrator 3.0)
---

# ⚙️ Develop (Agentic Engine v3.0)

Self-driving development engine with auto-skill detection, model routing, and transparent agent debate.

## 0. [AGENT] Orchestrator: Intelligence Setup
- [ ] **Model Router**: Analyze task complexity.
    - `[LIGHT]` → Recommend Flash/mini model.
    - `[HEAVY]` → Recommend Pro/Sonnet model.
- [ ] **Skill Discovery**: Scan codebase for tech signals (e.g., Supabase, React, Next.js) and auto-load matching skills from `~/.agent/skills/skills/`.
- [ ] **Board Init**: Update `.agent/memory/task_board.md` with mission, agents, and recommended model.

## 1. [AGENT] Lead Dev: Implementation
- [ ] **TDD Start**: Write failing tests based on `task_board` requirements.
- [ ] **Build**: Implement logic following `fsd-lite` and `clean-code`.
- [ ] **Sync**: Log technical decisions in `findings.md`.

## 2. [AGENT] Critic: Reflexion Loop (Multi-Turn)
- [ ] **Review**: Audit code against discovered skill standards.
- [ ] **Debate**: Record all critique and responses in `.agent/memory/agent_debate.md` (IN ENGLISH).
- [ ] **Reiterate**: If Critic rejects, Lead Dev must refactor until approved.

## 3. [AGENT] Secretary: Documentation
- [ ] **History (EN)**: Append feature record to `.agent/memory/feature_history_en.md`.
- [ ] **History (KR)**: Append feature record to `.agent/memory/feature_history_kr.md`.
- [ ] **Sync**: Update `findings.md` and `progress.md`.

## 4. [AGENT] QA & CISO: Final Guard
- [ ] **QA**: Run full regression suite (`test-automator`).
- [ ] **CISO Scan**: Execute `vulnerability-scanner`.
- [ ] **Handover**: Signal "Ready for Ship" only if 100% green.

---
> [!IMPORTANT]
> **Language Protocol**: Agent debate = English. User reports = Korean.
> **Model Router**: Check task_board.md header for recommended model.
