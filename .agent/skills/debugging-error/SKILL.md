---
name: debugging-error
description: Systematically identifies and resolves bugs using root cause analysis. Use when the user reports an error, a crash, or unexpected behavior.
---

# Debugging & Error Resolution

## When to use this skill
- When the user says "it's not working", "I got an error", or "fix this bug".
- When a build fails or tests turn red.
- When investigating performance issues.

## Workflow
1.  **Reproduction**: Can I trigger the error reliably? (If not, add logs until I can).
2.  **Isolation**: Isolate the component or function causing the issue.
3.  **Hypothesis**: Formulate a theory based on evidence (not guessing).
4.  **Verification**: Test the theory (e.g., by logging the state just before crash).
5.  **Resolution**: Apply the fix.
6.  **Regression Test**: Add a test case to prevent this specific bug from returning.

## Instructions
### The Golden Rule
**"Don't guess."** If you don't know why it failed, you haven't fixed it yet.

### Analysis Techniques
- **Stack Traces**: Read from the top down (for user code) or bottom up (for framework errors).
- **Binary Search**: Comment out half the code to see if the error persists.
- **Log Everything**: Input arguments, return values, and state changes.

### Common Pitfalls
- **Race Conditions**: Is `await` missing?
- **State Mutation**: Did something modify the object reference?
- **Env Vars**: Is the API key loaded?

## Resources
- [Rubber Duck Debugging](https://en.wikipedia.org/wiki/Rubber_duck_debugging)
