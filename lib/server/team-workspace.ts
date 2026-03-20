import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { resolveEffectivePlanTier } from "@/lib/server/effective-plan"

type ServiceSupabaseClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>

export type TeamWorkspaceRole = "owner" | "admin" | "member"
export type TeamInviteRole = "admin" | "member"
export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired"

export type TeamWorkspaceRow = {
    id: string
    owner_user_id: string
    name: string
    created_at: string
    updated_at: string
}

export type TeamWorkspaceMemberRow = {
    workspace_id: string
    user_id: string
    role: TeamWorkspaceRole
    joined_at: string
    invited_by: string | null
}

export type TeamWorkspaceInviteRow = {
    id: string
    workspace_id: string
    email: string
    role: TeamInviteRole
    token: string
    status: TeamInviteStatus
    invited_by: string
    accepted_by: string | null
    expires_at: string
    accepted_at: string | null
    created_at: string
    updated_at: string
}

function normalizeEmail(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase().slice(0, 320) : ""
}

function toIsoString(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    if (!trimmed) return null
    const timestamp = Date.parse(trimmed)
    if (Number.isNaN(timestamp)) return null
    return new Date(timestamp).toISOString()
}

function buildWorkspaceName(businessName: unknown): string {
    const trimmed = typeof businessName === "string" ? businessName.trim().slice(0, 120) : ""
    if (!trimmed) return "SnapQuote Team"
    return `${trimmed} Team`.slice(0, 120)
}

function buildInviteToken(): string {
    return crypto.randomUUID().replace(/-/g, "")
}

export async function resolveTeamPlanTier(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ planTier: string | null; error: string | null }> {
    const { data, error } = await supabase
        .from("profiles")
        .select("plan_tier, stripe_subscription_status, referral_trial_ends_at, referral_bonus_ends_at")
        .eq("id", userId)
        .maybeSingle()

    if (error) {
        return { planTier: null, error: error.message || "Failed to resolve plan tier" }
    }

    return { planTier: resolveEffectivePlanTier(data || {}), error: null }
}

export function hasTeamWorkspaceBootstrapAccess(planTier: string | null | undefined): boolean {
    return planTier === "team"
}

export async function getWorkspaceMembershipByUser(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ data: TeamWorkspaceMemberRow | null; error: string | null }> {
    const { data, error } = await supabase
        .from("team_workspace_members")
        .select("workspace_id, user_id, role, joined_at, invited_by")
        .eq("user_id", userId)
        .maybeSingle()

    return {
        data: (data as TeamWorkspaceMemberRow | null) ?? null,
        error: error ? error.message || "Failed to load team membership" : null,
    }
}

export async function getWorkspaceById(
    supabase: ServiceSupabaseClient,
    workspaceId: string
): Promise<{ data: TeamWorkspaceRow | null; error: string | null }> {
    const { data, error } = await supabase
        .from("team_workspaces")
        .select("id, owner_user_id, name, created_at, updated_at")
        .eq("id", workspaceId)
        .maybeSingle()

    return {
        data: (data as TeamWorkspaceRow | null) ?? null,
        error: error ? error.message || "Failed to load workspace" : null,
    }
}

export async function ensureOwnedTeamWorkspace(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ workspace: TeamWorkspaceRow | null; membership: TeamWorkspaceMemberRow | null; error: string | null }> {
    const existingWorkspace = await supabase
        .from("team_workspaces")
        .select("id, owner_user_id, name, created_at, updated_at")
        .eq("owner_user_id", userId)
        .maybeSingle()

    if (existingWorkspace.error) {
        return { workspace: null, membership: null, error: existingWorkspace.error.message || "Failed to load owned workspace" }
    }

    let workspace = (existingWorkspace.data as TeamWorkspaceRow | null) ?? null

    if (!workspace) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("business_name")
            .eq("id", userId)
            .maybeSingle()

        const now = new Date().toISOString()
        const inserted = await supabase
            .from("team_workspaces")
            .insert({
                owner_user_id: userId,
                name: buildWorkspaceName(profile?.business_name),
                created_at: now,
                updated_at: now,
            })
            .select("id, owner_user_id, name, created_at, updated_at")
            .single()

        if (inserted.error) {
            return { workspace: null, membership: null, error: inserted.error.message || "Failed to create team workspace" }
        }

        workspace = inserted.data as TeamWorkspaceRow
    }

    const memberResult = await getWorkspaceMembershipByUser(supabase, userId)
    if (memberResult.error) {
        return { workspace, membership: null, error: memberResult.error }
    }

    let membership = memberResult.data
    if (!membership) {
        const now = new Date().toISOString()
        const insertedMember = await supabase
            .from("team_workspace_members")
            .insert({
                workspace_id: workspace.id,
                user_id: userId,
                role: "owner",
                invited_by: userId,
                joined_at: now,
                created_at: now,
            })
            .select("workspace_id, user_id, role, joined_at, invited_by")
            .single()

        if (insertedMember.error) {
            return { workspace, membership: null, error: insertedMember.error.message || "Failed to create team membership" }
        }

        membership = insertedMember.data as TeamWorkspaceMemberRow
    }

    return { workspace, membership, error: null }
}

export async function resolveTeamWorkspaceAccess(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{
    planTier: string | null
    eligible: boolean
    workspace: TeamWorkspaceRow | null
    membership: TeamWorkspaceMemberRow | null
    error: string | null
}> {
    const membershipResult = await getWorkspaceMembershipByUser(supabase, userId)
    if (membershipResult.error) {
        return { planTier: null, eligible: false, workspace: null, membership: null, error: membershipResult.error }
    }

    const planTierResult = await resolveTeamPlanTier(supabase, userId)
    if (planTierResult.error) {
        return { planTier: null, eligible: false, workspace: null, membership: membershipResult.data, error: planTierResult.error }
    }

    if (membershipResult.data) {
        const workspaceResult = await getWorkspaceById(supabase, membershipResult.data.workspace_id)
        return {
            planTier: planTierResult.planTier,
            eligible: hasTeamWorkspaceBootstrapAccess(planTierResult.planTier),
            workspace: workspaceResult.data,
            membership: membershipResult.data,
            error: workspaceResult.error,
        }
    }

    if (!hasTeamWorkspaceBootstrapAccess(planTierResult.planTier)) {
        return {
            planTier: planTierResult.planTier,
            eligible: false,
            workspace: null,
            membership: null,
            error: null,
        }
    }

    const owned = await ensureOwnedTeamWorkspace(supabase, userId)
    return {
        planTier: planTierResult.planTier,
        eligible: true,
        workspace: owned.workspace,
        membership: owned.membership,
        error: owned.error,
    }
}

export async function listWorkspaceMembers(
    supabase: ServiceSupabaseClient,
    workspaceId: string
): Promise<{ data: Array<TeamWorkspaceMemberRow & { businessName?: string; email?: string }>; error: string | null }> {
    const memberResult = await supabase
        .from("team_workspace_members")
        .select("workspace_id, user_id, role, joined_at, invited_by")
        .eq("workspace_id", workspaceId)
        .order("joined_at", { ascending: true })

    if (memberResult.error) {
        return { data: [], error: memberResult.error.message || "Failed to load workspace members" }
    }

    const members = Array.isArray(memberResult.data) ? (memberResult.data as TeamWorkspaceMemberRow[]) : []
    const userIds = members.map((member) => member.user_id)
    let profileByUserId = new Map<string, { business_name?: string; email?: string }>()

    if (userIds.length > 0) {
        const profileResult = await supabase
            .from("profiles")
            .select("id, business_name, email")
            .in("id", userIds)

        if (!profileResult.error && Array.isArray(profileResult.data)) {
            profileByUserId = new Map(
                profileResult.data.map((profile: any) => [
                    profile.id,
                    {
                        business_name: typeof profile?.business_name === "string" ? profile.business_name : "",
                        email: typeof profile?.email === "string" ? profile.email : "",
                    },
                ])
            )
        }
    }

    return {
        data: members.map((member) => ({
            ...member,
            businessName: profileByUserId.get(member.user_id)?.business_name || undefined,
            email: profileByUserId.get(member.user_id)?.email || undefined,
        })),
        error: null,
    }
}

export async function listPendingWorkspaceInvites(
    supabase: ServiceSupabaseClient,
    workspaceId: string
): Promise<{ data: TeamWorkspaceInviteRow[]; error: string | null }> {
    const { data, error } = await supabase
        .from("team_workspace_invites")
        .select("id, workspace_id, email, role, token, status, invited_by, accepted_by, expires_at, accepted_at, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20)

    return {
        data: Array.isArray(data) ? (data as TeamWorkspaceInviteRow[]) : [],
        error: error ? error.message || "Failed to load pending invites" : null,
    }
}

export async function createWorkspaceInvite(
    supabase: ServiceSupabaseClient,
    input: {
        workspaceId: string
        invitedBy: string
        email: string
        role: TeamInviteRole
    }
): Promise<{ invite: TeamWorkspaceInviteRow | null; error: string | null; conflict?: boolean }> {
    const normalizedEmail = normalizeEmail(input.email)
    const existing = await supabase
        .from("team_workspace_invites")
        .select("id, workspace_id, email, role, token, status, invited_by, accepted_by, expires_at, accepted_at, created_at, updated_at")
        .eq("workspace_id", input.workspaceId)
        .eq("email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle()

    if (existing.error) {
        return { invite: null, error: existing.error.message || "Failed to load existing invite" }
    }

    if (existing.data) {
        return { invite: existing.data as TeamWorkspaceInviteRow, error: null, conflict: true }
    }

    const now = new Date()
    const invitePayload = {
        workspace_id: input.workspaceId,
        invited_by: input.invitedBy,
        email: normalizedEmail,
        role: input.role,
        token: buildInviteToken(),
        status: "pending",
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
    }

    const inserted = await supabase
        .from("team_workspace_invites")
        .insert(invitePayload)
        .select("id, workspace_id, email, role, token, status, invited_by, accepted_by, expires_at, accepted_at, created_at, updated_at")
        .single()

    return {
        invite: (inserted.data as TeamWorkspaceInviteRow | null) ?? null,
        error: inserted.error ? inserted.error.message || "Failed to create team invite" : null,
    }
}

export async function getInviteByToken(
    supabase: ServiceSupabaseClient,
    token: string
): Promise<{ data: TeamWorkspaceInviteRow | null; error: string | null }> {
    const { data, error } = await supabase
        .from("team_workspace_invites")
        .select("id, workspace_id, email, role, token, status, invited_by, accepted_by, expires_at, accepted_at, created_at, updated_at")
        .eq("token", token)
        .maybeSingle()

    return {
        data: (data as TeamWorkspaceInviteRow | null) ?? null,
        error: error ? error.message || "Failed to load invite" : null,
    }
}

export async function acceptWorkspaceInvite(
    supabase: ServiceSupabaseClient,
    input: {
        userId: string
        token: string
    }
): Promise<
    | { ok: true; joined: boolean; deduped?: boolean; workspace: TeamWorkspaceRow; role: TeamInviteRole }
    | { ok: false; status: number; error: string }
> {
    const inviteResult = await getInviteByToken(supabase, input.token)
    if (inviteResult.error) return { ok: false, status: 500, error: inviteResult.error }
    if (!inviteResult.data) return { ok: false, status: 404, error: "Invite not found." }

    const invite = inviteResult.data
    const expiresAt = toIsoString(invite.expires_at)
    if (invite.status !== "pending") {
        return { ok: false, status: 409, error: "Invite has already been used." }
    }

    if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
        await supabase
            .from("team_workspace_invites")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", invite.id)
        return { ok: false, status: 410, error: "Invite has expired." }
    }

    const existingMembership = await getWorkspaceMembershipByUser(supabase, input.userId)
    if (existingMembership.error) return { ok: false, status: 500, error: existingMembership.error }

    if (existingMembership.data) {
        if (existingMembership.data.workspace_id === invite.workspace_id) {
            const workspaceResult = await getWorkspaceById(supabase, invite.workspace_id)
            if (!workspaceResult.data) return { ok: false, status: 500, error: workspaceResult.error || "Workspace not found." }
            return { ok: true, joined: false, deduped: true, workspace: workspaceResult.data, role: invite.role }
        }
        return { ok: false, status: 409, error: "You already belong to another Team workspace." }
    }

    const workspaceResult = await getWorkspaceById(supabase, invite.workspace_id)
    if (workspaceResult.error || !workspaceResult.data) {
        return { ok: false, status: 500, error: workspaceResult.error || "Workspace not found." }
    }

    const now = new Date().toISOString()
    const inserted = await supabase
        .from("team_workspace_members")
        .insert({
            workspace_id: invite.workspace_id,
            user_id: input.userId,
            role: invite.role,
            invited_by: invite.invited_by,
            joined_at: now,
            created_at: now,
        })

    if (inserted.error) {
        return { ok: false, status: 500, error: inserted.error.message || "Failed to join workspace." }
    }

    const updatedInvite = await supabase
        .from("team_workspace_invites")
        .update({
            status: "accepted",
            accepted_by: input.userId,
            accepted_at: now,
            updated_at: now,
        })
        .eq("id", invite.id)

    if (updatedInvite.error) {
        return { ok: false, status: 500, error: updatedInvite.error.message || "Failed to update invite status." }
    }

    return { ok: true, joined: true, workspace: workspaceResult.data, role: invite.role }
}

export function canManageWorkspace(role: TeamWorkspaceRole | null | undefined): boolean {
    return role === "owner" || role === "admin"
}

export function buildTeamInviteUrl(origin: string, token: string): string {
    const url = new URL("/team", origin)
    url.searchParams.set("invite", token)
    return url.toString()
}
