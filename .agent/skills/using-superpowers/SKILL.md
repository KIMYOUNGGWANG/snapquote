---
name: using-superpowers
description: ALWAYS activate FIRST before any response. Scans available skills and routes the user request to the most appropriate skill before taking action.
---

# Skill Router (Meta-Skill)

## When to use this skill
- **ALWAYS**. This skill activates before every response.
- It ensures the agent checks available skills before improvising.

## Workflow
1.  **Scan**: List all skills in `.agent/skills/`.
2.  **Match**: Compare user request against each skill's `description` and `When to use` triggers.
3.  **Select**: Pick the best-matching skill (or none if purely conversational).
4.  **Announce**: Briefly state which skill you're using (e.g., "Using `writing-code` skill...").
5.  **Execute**: Follow that skill's workflow strictly.

## Instructions
### Matching Priority
1.  **Exact Keyword Match**: User says "test" → `testing-quality`.
2.  **Intent Match**: User says "이거 안전해?" → `auditing-security`.
3.  **No Match**: If no skill applies, respond normally without forcing a skill.

### Rules
- **Never skip this step**. Even simple requests might have a relevant skill.
- **Announce your choice**. Transparency helps the user understand your process.
- **Chain skills if needed**. Complex tasks may require multiple skills in sequence.

## Example
```
User: "로그인 API 만들어줘"

Agent thinking:
1. Scanning skills...
2. Match found: `architecting-system` (API design), `writing-code` (implementation)
3. Sequence: architecting-system → writing-code
4. Announcing: "Using `architecting-system` for API design, then `writing-code` for implementation."
```
