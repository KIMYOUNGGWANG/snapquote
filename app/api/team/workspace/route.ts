import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import {
    buildTeamInviteUrl,
    canManageWorkspace,
    listPendingWorkspaceInvites,
    listWorkspaceMembers,
    resolveTeamWorkspaceAccess,
} from "@/lib/server/team-workspace"

function getAppOrigin(req: Request): string {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (configured) return configured
    return new URL(req.url).origin
}

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-workspace:${auth.userId}:${ip}`,
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

    const access = await resolveTeamWorkspaceAccess(supabase, auth.userId)
    if (access.error) {
        return NextResponse.json(
            { error: { message: access.error, code: 500 } },
            { status: 500 }
        )
    }

    if (!access.workspace || !access.membership) {
        return NextResponse.json({
            ok: true,
            eligible: access.eligible,
            hasWorkspace: false,
            members: [],
            pendingInvites: [],
        })
    }

    const [membersResult, invitesResult] = await Promise.all([
        listWorkspaceMembers(supabase, access.workspace.id),
        listPendingWorkspaceInvites(supabase, access.workspace.id),
    ])

    if (membersResult.error || invitesResult.error) {
        return NextResponse.json(
            { error: { message: membersResult.error || invitesResult.error || "Failed to load Team workspace", code: 500 } },
            { status: 500 }
        )
    }

    const origin = getAppOrigin(req)

    return NextResponse.json({
        ok: true,
        eligible: access.eligible,
        hasWorkspace: true,
        workspace: {
            id: access.workspace.id,
            name: access.workspace.name,
            role: access.membership.role,
            memberCount: membersResult.data.length,
            canManage: canManageWorkspace(access.membership.role),
        },
        members: membersResult.data.map((member) => ({
            userId: member.user_id,
            role: member.role,
            joinedAt: member.joined_at,
            ...(member.businessName ? { businessName: member.businessName } : {}),
            ...(member.email ? { email: member.email } : {}),
        })),
        pendingInvites: invitesResult.data.map((invite) => ({
            inviteId: invite.id,
            email: invite.email,
            role: invite.role,
            status: invite.status,
            token: invite.token,
            inviteUrl: buildTeamInviteUrl(origin, invite.token),
            expiresAt: invite.expires_at,
            createdAt: invite.created_at,
        })),
    })
}
