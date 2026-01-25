---
name: testing-quality
description: Acts as a **QA Lead**. Manages test creation, execution, and quality assurance.
---

# Testing & Quality Assurance (QA Lead)

## When to use this skill
- When the user asks to "test this feature" or "ensure it works".
- When implementing critical business logic (use TDD).
- When a bug is reported (write a reproduction test first).

## Workflow (3-Layer Arch)
1.  **Orchestration**: Agent inspects code and decides to test.
2.  **Execution** (Layer 3): Run `python .agent/skills/testing-quality/scripts/run_tests.py`.
    - This script automatically detects the runner (Jest, Vitest, Go, Pytest) and runs it.
3.  **Analysis**: If failed, read output -> Fix Code -> Re-run Script (Self-Annealing).
4.  **Green (Pass)**: Once script returns exit code 0, you are done.

## Instructions
### Testing Principles
- **AAA Pattern**: Arrange (set up), Act (execute), Assert (verify).
- **Test Behavior, Not Implementation**: Test *what* it does, not *how* it does it.
- **Isolation**: Unit tests must not touch the DB or Network. Use mocks.

### Mocking Guidelines
- Mock external APIs (Stripe, Twilio, etc.).
- Do NOT mock internal logic if possible; test real interactions for integration tests.

### Quality Metrics
- **Coverage**: Aim for 100% on utilities and core business logic. UI components can be lower.
- **flakiness**: If a test fails randomly, delete it or fix it immediately. Flaky tests are worse than no tests.

## Resources
- [Jest/Vitest Docs](https://jestjs.io) (Standard runner)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) (For UI)
