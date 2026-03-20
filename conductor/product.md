# 📦 Product Strategy: SnapQuote

SnapQuote is a trade-focused AI estimating product for small contractors who need to create professional estimates quickly from field notes, photos, and multilingual voice input.

## Overview

SnapQuote helps owner-operator contractors turn messy on-site inputs into clean, client-ready estimates and payment flows.

Core product promise:
- Speak on site in English, Spanish, or Korean
- Generate a structured professional estimate in English
- Send by email or SMS
- Collect payment through Stripe-linked flows

## Target Audience

Primary users:
- Small trade contractors
- Owner-operators and very small crews
- Field-first businesses in plumbing, electrical, HVAC, roofing, remodeling, tile, and related trades

Priority beachhead:
- Hispanic contractors in the United States

Secondary segment:
- Korean-speaking contractors in the United States and Canada

## Core Features

1. AI transcription for trade field notes
2. AI estimate generation from notes and images
3. Estimate delivery via email and SMS
4. Stripe payment-link generation and payment status sync
5. SaaS billing, usage tracking, and plan enforcement
6. Offline-safe estimate sync and recovery flows
7. Quote recovery, referral, and lead-capture growth loops

## Product Principles

- Trust over feature count
- Fast field workflow over back-office complexity
- Server Components by default, strict type safety, no `any`
- Runtime work must follow `docs/api-spec.md` before implementation changes

## Current Planning Priorities

1. Keep the delivered free-tier, referral, onboarding lifecycle, offline workflow, photo-estimate, QuickBooks handoff, PDF branding packaging, and Team collaboration flows stable while watching conversion impact.
2. Treat Team collaboration as shared workspace, shared estimate feed, composer handoff, edit-session lease, takeover, and direct shared save today; defer true live multi-user merge editing until it has a separate scoped contract.
3. Keep delivered runtime work separate from still-open strategy and GTM backlog before `/develop`.
