# Technology Stack Guide

## Core Framework
- **Framework**: Next.js 15.1.6 (App Router, Server Components, Server Actions)
- **UI Library**: React 19.0.0
- **Language**: TypeScript 5.7.3 (Strict Mode)

## Database & ORM
- **Database**: Neon (Serverless PostgreSQL)
- **ORM**: Drizzle ORM (Type-safe query builder)

## Authentication
- **Provider**: Clerk (Sign-up/Login, Webhooks, Session Management)

## Real-time
- **Engine**: Pusher Channels (WebSocket-based Chat, Typing Indicators, Online Status)

## Storage & CDN
- **Storage**: Cloudflare R2 (S3 Compatible API)
- **Image Processing**: Sharp (Resizing, WebP conversion, EXIF removal)

## Caching & Rate Limiting
- **Cache/KV**: Upstash Redis (Caching, 60s TTL, Rate Limiting)

## UI & Styling
- **Styling**: Tailwind CSS 3.4 (Utility CSS)
- **Components**: shadcn/ui (Radix UI based - Dialog, Form, Select, etc.)
- **Animations**: Framer Motion (Page Transitions), Lottie React
- **Icons**: Lucide React
- **3D**: Three.js + React Three Fiber (Homepage 3D Backgrounds)

## Form & Validation
- **State Mgmt**: React Hook Form
- **Validation**: Zod 4 (Schema Validation - Client + Server)

## Email
- **Sending**: Resend
- **Templates**: React Email

## Security
- **Principles**: HTTPS, CSRF Protection, Input Sanitization (Zod), Rate Limiting (Upstash)
