import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { getTeamEstimateDetail, saveTeamEstimateFromPayload } from "@/lib/server/team-estimates"
import { teamEstimateUpdateSchema } from "@/lib/validation/api-schemas"

function normalizeEstimateId(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 120) return null
    return trimmed
}

export async function GET(req: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) return auth.response

    const { estimateId: rawEstimateId } = await context.params
    const estimateId = normalizeEstimateId(rawEstimateId)
    if (!estimateId) {
        return NextResponse.json(
            { error: { message: "Invalid estimate id", code: 400 } },
            { status: 400 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-estimate-detail:${auth.userId}:${estimateId}:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    const result = await getTeamEstimateDetail(supabase, auth.userId, estimateId)
    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        workspaceId: result.workspaceId,
        estimate: result.estimate,
    })
}

export async function PATCH(req: Request, context: { params: Promise<{ estimateId: string }> }) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) return auth.response

    const { estimateId: rawEstimateId } = await context.params
    const estimateId = normalizeEstimateId(rawEstimateId)
    if (!estimateId) {
        return NextResponse.json(
            { error: { message: "Invalid estimate id", code: 400 } },
            { status: 400 }
        )
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-estimate-update:${auth.userId}:${estimateId}:${ip}`,
        limit: 30,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const parsed = teamEstimateUpdateSchema.safeParse(body)
    if (!parsed.success) {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    const result = await saveTeamEstimateFromPayload(supabase, {
        userId: auth.userId,
        estimateId,
        payload: parsed.data,
    })

    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        estimate: result.estimate,
    })
}
