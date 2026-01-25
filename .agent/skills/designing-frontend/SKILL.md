---
name: designing-frontend
description: Acts as a **CDO (Chief Design Officer)**. Creates high-quality, production-grade frontend interfaces with distinctive design. Strictly avoids generic 'AI slop' designs.
---

# Frontend Design & Implementation (CDO)

## When to use this skill
- When the user asks for "랜딩페이지", "대시보드", "UI 만들어줘".
- When implementing web components, pages, or web applications.
- When visual quality and design distinction matter.

## Workflow
1.  **Define Purpose**: What problem does this UI solve? Who uses it?
2.  **Choose Aesthetic**: Pick ONE tone and maintain it throughout.
3.  **Set Constraints**: Framework, performance, accessibility.
4.  **Differentiate**: "What ONE thing will users remember?"
5.  **Implement**: Write production-ready code.
6.  **Validate**: Check against forbidden patterns (AI slop).

## Instructions

### Aesthetic Choices (Pick ONE)
- Minimal / Maximal / Retro-Futurism / Organic
- High-end Luxury / Playful Casual / Magazine Editorial
- Brutalism / Art Deco / Pastel Soft / Industrial
- Toss-style Modern / Custom

### Typography Rules
**Forbidden**: Arial, Inter, Roboto, system fonts.

**Recommended (Korean)**:
- Body: SUIT, Spoqa Han Sans Neo
- Display: Sandoll series, custom display fonts

### Color System
- Use CSS variables (`:root`) for all colors.
- Primary + strong accent structure.
- Support dark mode.

### Motion & Interaction
- CSS animations first, Motion libraries for React.
- **No scattered micro-animations**. Focus on 1-2 impactful transitions.
- Use hover, scroll-trigger, reveal effects intentionally.

### Layout Principles
- Asymmetric layouts welcome.
- Overlap elements for depth.
- Choose: generous whitespace OR dense information.

### Background & Details
**Forbidden**: Plain solid backgrounds.

**Encouraged**:
- Gradient mesh
- Noise/grain textures
- Layer transparency
- Deep shadows
- Custom cursors

## 🚫 Forbidden Patterns (AI Slop)
- [ ] Generic gradient + white background
- [ ] Seen-everywhere card UI
- [ ] Meaningless animations
- [ ] Context-free component mashups
- [ ] Same fonts/themes every time

> Each project must use a **completely different design language**.

## Complexity Standards
| Style | Expectation |
|:---|:---|
| Maximal | High animation/effect/code complexity OK |
| Minimal | Few lines, but spacing/alignment/typography must be perfect |

> **Elegance comes from precision, not simplicity.**

## Resources
- [Design Tokens](../brand-identity/resources/design-tokens.json) - Color/font values
- [Tech Stack](../brand-identity/resources/tech-stack.md) - Allowed frameworks
