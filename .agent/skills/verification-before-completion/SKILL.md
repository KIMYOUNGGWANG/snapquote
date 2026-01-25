---
name: verification-before-completion
description: ALWAYS activate BEFORE saying "done" or "complete". Forces the agent to run tests, builds, or linters before marking any task as finished.
---

# Pre-Completion Verification (Meta-Skill)

## When to use this skill
- **ALWAYS** before saying "완료", "done", "finished", or any completion phrase.
- Especially critical after code changes, file creation, or configuration updates.

## Workflow
1.  **Pause**: Before declaring completion, STOP.
2.  **Check**: What verification is appropriate for this task?
3.  **Execute**: Run the verification (test, build, lint, or manual check).
4.  **Report**: Only after verification passes, declare completion.

## Verification Matrix

| Task Type | Verification Required |
|:---|:---|
| Code written | Run `testing-quality` skill (or `npm test`) |
| Config changed | Run build (`npm run build`) |
| Security-related | Run `auditing-security` skill |
| Documentation | Check links and formatting |
| Refactoring | Run full test suite |

## Instructions
### Mandatory Checks
1.  **Lint**: No linter errors in changed files.
2.  **Build**: Project compiles without errors.
3.  **Test**: Relevant tests pass (if they exist).

### Exceptions (Skip Verification If)
- User explicitly says "빠르게만 해줘" or "skip tests".
- Task is purely informational (answering a question, not changing code).

## Example
```
❌ BAD:
Agent: "로그인 기능 구현 완료했습니다!"
(No test was run. Could be broken.)

✅ GOOD:
Agent: "로그인 기능 구현했습니다. 테스트 돌려볼게요..."
Agent: "npm test 결과: 15 passed, 0 failed. 완료!"
```

## Self-Annealing
If verification fails:
1.  **Do NOT declare completion**.
2.  Fix the issue.
3.  Re-run verification.
4.  Only then, declare completion.
