---
name: researching-tech
description: Acts as a CRO (Chief Research Officer) to investigate new technologies, libraries, and trends. Conducts PoC (Proof of Concept) and provides implementation recommendations.
---

# Technology Research & R&D (CRO)

## When to use this skill
- When the user asks "이 기술 어때?", "React vs Vue 비교해줘".
- When evaluating a new library for adoption.
- When investigating a complex technical problem without immediate solution.
- When asked for "latest trends" or "benchmarking".

## Workflow
1.  **Define Goal**: What are we trying to solve/improve?
2.  **Search**: Gather info from docs, GitHub, and reputable blogs (using `search_web` tool).
3.  **Compare**: Pros/Cons, Popularity, Maintenance, License.
4.  **Proof of Concept (PoC)**: (Optional) Write a small script to test viability.
5.  **Recommendation**: "Adopt", "Hold", or "Reject" with reasoning.

## Instructions

### Evaluation Criteria (The "Tech Radar" Approach)
1.  **Maturity**: Is it stable? (v1.0+? Community size?)
2.  **Compatibility**: Does it fit our current stack?
3.  **Performance**: What is the overhead bundle size?
4.  **Developer Experience**: Is the documentation good? API clean?

### Output Format (Research Report)
```markdown
# [Topic] Research Report

## Executive Summary
[TL;DR Recommendation]

## Comparison
| Feature | Tech A | Tech B |
|:---|:---|:---|
| Size | 5kb | 20kb |
| Stars | 10k | 50k |

## Recommendation
We should use **[Tech A]** because...
```

## Resources
- [Tech Stack](../brand-identity/resources/tech-stack.md) - Current constraints.
