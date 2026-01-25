---
name: brand-identity
description: Provides the single source of truth for brand guidelines, design tokens, technology choices, and voice/tone. Use this skill whenever generating UI components, styling applications, writing copy, or creating user-facing assets to ensure brand consistency.
---

# Brand Identity & Guidelines

**Brand Name:** [INSERT BRAND NAME HERE]

This skill defines the core constraints for visual design and technical implementation for the brand. You must adhere to these guidelines strictly to maintain consistency.

## Reference Documentation

Depending on the task you are performing, consult the specific resource files below. Do not guess brand elements; always read the corresponding file.

### For Visual Design & UI Styling
If you need exact colors, fonts, border radii, or spacing values, read:
👉 **[`resources/design-tokens.json`](resources/design-tokens.json)**

### For Coding & Component Implementation
If you are generating code, choosing libraries, or structuring UI components, read the technical constraints here:
👉 **[`resources/tech-stack.md`](resources/tech-stack.md)**

### For Copywriting & Content Generation
If you are writing marketing copy, error messages, documentation, or user-facing text, read the persona guidelines here:
👉 **[`resources/voice-tone.md`](resources/voice-tone.md)**

## 🚫 Design Commandments (Never Do This)
1.  **NO AI Slop**: Avoid generic "AI style" gradients, contextless cards, or typical "tech blue" color schemes.
2.  **Typography**: Never use system fonts (Arial, Times). Use the tokens.
3.  **XSS Protection**: `dangerouslySetInnerHTML` is FORBIDDEN.

## 🖌️ Design Thinking
Before designing, answer:
1.  **Purpose**: What problem does this solve?
2.  **Tone**: (Pick one) Minimal / Brutalist / High-end Luxury / Toss-style.
3.  **Differentiation**: What is the ONE thing users will remember?
