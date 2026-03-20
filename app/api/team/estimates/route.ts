import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient, ensureProfileExists } from "@/lib/server/stripe-connect"
import { getWorkspaceMembershipByUser } from "@/lib/server/team-workspace"
import { teamEstimateFeedQuerySchema } from "@/lib/validation/api-schemas"

export async function GET(req: Request) {
    const auth = await requireAuthenticatedUser(req)
    if (!auth.ok) {
        return auth.response
    }

    const ip = getClientIp(req)
    const rateLimit = await checkRateLimit({
        key: `team-estimates:${auth.userId}:${ip}`,
        limit: 60,
        windowMs: 10 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { error: { message: "Too many requests", code: 429 } },
            { status: 429 }
        )
    }

    const params = Object.fromEntries(new URL(req.url).searchParams.entries())
    const parsedQuery = teamEstimateFeedQuerySchema.safeParse(params)
    if (!parsedQuery.success) {
        return NextResponse.json(
            { error: { message: "Invalid request payload", code: 400 } },
            { status: 400 }
        )
    }

    const limit = parsedQuery.data.limit || 25

    const supabase = createServiceSupabaseClient()
    if (!supabase) {
        return NextResponse.json(
            { error: { message: "Supabase service configuration is missing", code: 500 } },
            { status: 500 }
        )
    }

    await ensureProfileExists(supabase, auth.userId)

    const membershipResult = await getWorkspaceMembershipByUser(supabase, auth.userId)
    if (membershipResult.error) {
        return NextResponse.json(
            { error: { message: membershipResult.error, code: 500 } },
            { status: 500 }
        )
    }

    if (!membershipResult.data) {
        return NextResponse.json(
            { error: { message: "You are not part of a Team workspace.", code: 403 } },
            { status: 403 }
        )
    }

    const memberRows = await supabase
        .from("team_workspace_members")
        .select("user_id")
        .eq("workspace_id", membershipResult.data.workspace_id)

    if (memberRows.error) {
        return NextResponse.json(
            { error: { message: memberRows.error.message || "Failed to load Team members", code: 500 } },
            { status: 500 }
        )
    }

    const memberIds = Array.isArray(memberRows.data)
        ? memberRows.data.map((member: any) => member.user_id).filter((value: unknown): value is string => typeof value === "string")
        : []

    if (memberIds.length === 0) {
        return NextResponse.json({
            ok: true,
            workspaceId: membershipResult.data.workspace_id,
            count: 0,
            estimates: [],
        })
    }

    const estimatesResult = await supabase
        .from("estimates")
        .select("id, user_id, estimate_number, total_amount, status, updated_at, created_at, clients(name), profiles(business_name)")
        .in("user_id", memberIds)
        .order("updated_at", { ascending: false })
        .limit(limit)

    if (estimatesResult.error) {
        return NextResponse.json(
            { error: { message: estimatesResult.error.message || "Failed to load Team estimates", code: 500 } },
            { status: 500 }
        )
    }

    const estimates = Array.isArray(estimatesResult.data) ? estimatesResult.data : []

    return NextResponse.json({
        ok: true,
        workspaceId: membershipResult.data.workspace_id,
        count: estimates.length,
        estimates: estimates.map((estimate: any) => ({
            estimateId: estimate.id,
            estimateNumber: estimate.estimate_number,
            ownerUserId: estimate.user_id,
            ...(typeof estimate?.profiles?.business_name === "string" && estimate.profiles.business_name
                ? { ownerBusinessName: estimate.profiles.business_name }
                : {}),
            ...(typeof estimate?.clients?.name === "string" && estimate.clients.name
                ? { clientName: estimate.clients.name }
                : {}),
            status: estimate.status || "draft",
            totalAmount: typeof estimate.total_amount === "number" ? estimate.total_amount : 0,
            updatedAt: estimate.updated_at,
            createdAt: estimate.created_at,
        })),
    })
}
