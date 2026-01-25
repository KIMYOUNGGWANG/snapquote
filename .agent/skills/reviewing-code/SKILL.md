---
name: reviewing-code
description: Acts as a **Tech Lead**. The quality gate. Automated checklist for code review before committing.
---

# Code Review Protocol (Tech Lead)

## When to use this skill
- When the user asks "review my code" or "check for errors".
- Before committing changes to main branches.
- When merging a feature branch.

## Workflow (3-Layer Arch)
1.  **Execution** (Layer 3): Run `python .agent/skills/reviewing-code/scripts/complexity_check.py` to identify large files.
2.  **Security Scan**: Verify `auditing-security` pass.
3.  **Functionality Check**: Does the code match the requirements? Are edge cases handled?
4.  **Performance Check**: Are there N+1 queries? Unnecessary re-renders?
5.  **Style & Readability**: Variable naming, function length, and comment quality.
6.  **Output**: Provide a list of "Must Fix", "Should Fix", and "Nice to Have".

## Instructions
### Security Audits (Critical)
- **Secrets**: GREP for `key`, `token`, `password`. If found in code, FAIL immediately.
- **Input Validation**: Are inputs sanitized? (e.g., `dangerouslySetInnerHTML` in React).

### Anti-Patterns to Flag
- **God Functions**: Functions > 50 lines.
- **Prop Drilling**: Passing props through > 3 levels (Suggest Context or State Manager).
- **Magic Numbers**: Usage of unexplained raw numbers (Suggest strict constants).

## Resources
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) (Security baseline)
