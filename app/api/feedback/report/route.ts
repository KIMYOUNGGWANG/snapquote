import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const DEFAULT_LOOKBACK_DAYS = 7
const MAX_LOOKBACK_DAYS = 90
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type FeedbackCategory = "bug" | "feature" | "general"

type FeedbackRow = {
    id?: string | null
    user_id?: string | null
    category?: string | null
    description?: string | null
    metadata?: Record<string, unknown> | null
    created_at?: string | null
}

function isAuthorized(req: Request): boolean {
    const secret = process.env.CRON_SECRET
    if (!secret) return false

    const bearer = req.headers.get("authorization")
    const headerSecret = req.headers.get("x-cron-secret")

    return bearer === `Bearer ${secret}` || headerSecret === secret
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number(value ?? fallback)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function asTrimmedString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return ""
    return value.trim().slice(0, maxLength)
}

function asFeedbackCategory(value: unknown): FeedbackCategory {
    const normalized = asTrimmedString(value, 24).toLowerCase()
    if (normalized === "bug" || normalized === "feature" || normalized === "general") {
        return normalized
    }
    return "general"
}

function asMetadata(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

export async function GET(req: Request) {
    if (!process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 })
    }
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: "Missing Supabase service credentials" }, { status: 500 })
    }
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const lookbackDays = parseBoundedInt(url.searchParams.get("lookbackDays"), DEFAULT_LOOKBACK_DAYS, 1, MAX_LOOKBACK_DAYS)
    const limit = parseBoundedInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT)
    const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data, error } = await supabase
        .from("feedback")
        .select("id, user_id, category, description, metadata, created_at")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (error) {
        console.error("Feedback report query failed:", error)
        return NextResponse.json({ error: "Failed to load feedback report" }, { status: 500 })
    }

    const rows = Array.isArray(data) ? (data as FeedbackRow[]) : []
    const counts = {
        total: rows.length,
        bug: 0,
        feature: 0,
        general: 0,
    }
    const pathCounts = new Map<string, number>()

    const latest = rows.map((row) => {
        const metadata = asMetadata(row.metadata)
        const category = asFeedbackCategory(row.category)
        const path = asTrimmedString(metadata.path, 200)
        const rating = Number(metadata.rating)

        counts[category] += 1
        if (path) {
            pathCounts.set(path, (pathCounts.get(path) || 0) + 1)
        }

        return {
            id: asTrimmedString(row.id, 128),
            userId: asTrimmedString(row.user_id, 128) || null,
            createdAt: asTrimmedString(row.created_at, 64),
            category,
            message: asTrimmedString(row.description, 2000),
            path: path || null,
            rating: Number.isFinite(rating) ? rating : null,
        }
    })

    const topPaths = Array.from(pathCounts.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
        .slice(0, 10)

    return NextResponse.json({
        ok: true,
        lookbackDays,
        since: sinceIso,
        counts,
        topPaths,
        latest,
    })
}
