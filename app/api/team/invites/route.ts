import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    buildTeamInviteUrl,
    canManageWorkspace,
    createWorkspaceInvite,
    resolveTeamWorkspaceAccess,
} from "@/lib/server/team-workspace"
import { teamInviteSchema } from "@/lib/validation/api-schemas"

function getAppOrigin(req: Request): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (configured) return configured
    return new URL(req.url).origin
}

export async function POST(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-invites:${auth.userId}:${ip}`,
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

    const parsed = teamInviteSchema.safeParse(body)
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

    const access = await resolveTeamWorkspaceAccess(supabase, auth.userId)
    if (access.error) {
        return NextResponse.json(
            { error: { message: access.error, code: 500 } },
            { status: 500 }
        )
    }

    if (!access.eligible) {
        return NextResponse.json(
            { error: "Team workspace invites require the Team plan." },
            { status: 402 }
        )
    }

    if (!access.workspace || !access.membership || !canManageWorkspace(access.membership.role)) {
        return NextResponse.json(
            { error: { message: "You do not have permission to manage Team invites.", code: 403 } },
            { status: 403 }
        )
    }

    const created = await createWorkspaceInvite(supabase, {
        workspaceId: access.workspace.id,
        invitedBy: auth.userId,
        email: parsed.data.email,
        role: parsed.data.role || "member",
    })

    if (created.error) {
        return NextResponse.json(
            { error: { message: created.error, code: 500 } },
            { status: 500 }
        )
    }

    if (!created.invite) {
        return NextResponse.json(
            { error: { message: "Failed to create Team invite.", code: 500 } },
            { status: 500 }
        )
    }

    if (created.conflict) {
        return NextResponse.json(
            { error: { message: "A pending invite already exists for that email.", code: 409 } },
            { status: 409 }
        )
    }

    const origin = getAppOrigin(req)

    return NextResponse.json({
        ok: true,
        invite: {
            inviteId: created.invite.id,
            email: created.invite.email,
            role: created.invite.role,
            status: created.invite.status,
            token: created.invite.token,
            inviteUrl: buildTeamInviteUrl(origin, created.invite.token),
            expiresAt: created.invite.expires_at,
            createdAt: created.invite.created_at,
        },
    })
}
