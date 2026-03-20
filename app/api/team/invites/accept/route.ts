import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { acceptWorkspaceInvite } from "@/lib/server/team-workspace"
import { teamInviteAcceptSchema } from "@/lib/validation/api-schemas"

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-invite-accept:${auth.userId}:${ip}`,
        limit: 20,
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

    const parsed = teamInviteAcceptSchema.safeParse(body)
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

    const result = await acceptWorkspaceInvite(supabase, {
        userId: auth.userId,
        token: parsed.data.token,
    })

    if (!result.ok) {
        return NextResponse.json(
            { error: { message: result.error, code: result.status } },
            { status: result.status }
        )
    }

    return NextResponse.json({
        ok: true,
        joined: result.joined,
        ...(result.deduped ? { deduped: true } : {}),
        workspace: {
            id: result.workspace.id,
            name: result.workspace.name,
            role: result.role,
        },
    })
}
