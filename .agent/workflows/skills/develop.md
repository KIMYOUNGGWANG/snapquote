---
name: develop
description: The Orchestrator. Coordinates planning, building, and reviewing features using specialized sub-skills.
---

# 🎼 Develop - The Orchestrator

This skill acts as the implementation manager, coordinating specialized agents to deliver high-quality features.

## 🔄 The Cycle

1.  **Plan** (`/plan`): Create a rock-solid plan.
2.  **Build** (Default): Implement the approved plan.
3.  **Review** (`/review`): Verify quality before delivery.

## 🛠️ Usage

When the user asks to "build X" or run `/develop X`:

### Step 1: Planning Phase
- **Action**: Switch to **PLANNING** mode.
- **Skill**: Invoke `@[planning]` or read `.agent/workflows/skills/plan.md`.
- **Goal**: Produce `implementation_plan.md` (PRD).
- **Check**: Ask for user approval before proceeding.

### Step 2: Execution Phase
- **Action**: Switch to **EXECUTION** mode.
- **Skill**: Use `@[frontend]` or standard coding skills.
- **Goal**: Implement features defined in `phase 1`, `phase 2`, etc.
- **Check**: Update `task.md` continuously.

### Step 3: Review Phase
- **Action**: Switch to **VERIFICATION** mode.
- **Skill**: Invoke `.agent/workflows/skills/review.md`.
- **Goal**: Verify against the original PRD.
- **Output**: `walkthrough.md` with proof of work.

## 🧠 Context Management

- Always keep `task.md` updated as the single source of truth.
- If scope creep occurs, pause and ask to update the plan.
- Use `notify_user` to signal transitions between phases.
