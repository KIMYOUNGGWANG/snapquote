---
name: brainstorming
description: Facilitates collaborative design exploration. Use before implementation when requirements are vague or design direction is needed.
---

# Brainstorming

## When to use this skill
- When the user asks to "brainstorm" or "discuss ideas".
- When requirements are unclear or ambiguous.
- Before creating a formal plan, if the direction is not yet set.

## Workflow
1.  **Context Check**: Review existing files and project state.
2.  **Inquiry**: Ask clarifying questions to understand the goal.
3.  **Exploration**: Propose multiple approaches with trade-offs.
4.  **Convergence**: Narrow down to a single design direction.
5.  **Design Draft**: Present the design in small, validatable chunks.
6.  **Handoff**: Transition to the `planning` skill.

## Instructions
### Core Principles
- **One Question at a Time**: Avoid overwhelming the user.
- **Incremental Validation**: Check agreement after each section of the design.
- **YAGNI**: Remove unnecessary features; focus on the core need.

### The Process
**1. Understanding the Idea**
Start by asking questions to refine the core idea. Prefer multiple-choice questions to reduce user cognitive load. Focus on purpose, constraints, and success criteria.

**2. Exploring Approaches**
Propose 2-3 different technical or design approaches. Explain the trade-offs of each. State your recommendation clearly but be open to alternatives.

**3. Presenting the Design**
Once the direction is chosen, present the design. Break it down into sections of 200-300 words. After each section, ask the user if it looks correct so far. Cover architecture, components, data flow, and error handling.

**4. Documentation**
After the session, summarize the agreed-upon design into a document (e.g., `docs/design/feature-design.md`) and commit it. Then, ask if the user is ready to move to implementation.
