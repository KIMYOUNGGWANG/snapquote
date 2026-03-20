import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { getWorkspaceMembershipByUser } from "@/lib/server/team-workspace"

type ServiceSupabaseClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>

const TEAM_EDIT_SESSION_TTL_MS = 60 * 1000

export type TeamEstimateItem = {
    id: string
    itemNumber: number
    category: string
    description: string
    quantity: number
    unit: string
    unit_price: number
    total: number
}

export type TeamEstimateSection = {
    id: string
    name: string
    divisionCode?: string
    items: TeamEstimateItem[]
}

export type TeamEstimateDetail = {
    estimateId: string
    estimateNumber: string
    ownerUserId: string
    ownerBusinessName?: string
    clientName: string
    clientAddress: string
    summary_note: string
    status: "draft" | "sent" | "paid"
    taxRate: number
    taxAmount: number
    totalAmount: number
    createdAt: string
    updatedAt: string
    sentAt?: string
    items: TeamEstimateItem[]
    sections?: TeamEstimateSection[]
}

export type TeamEstimateSessionState = {
    estimateId: string
    active: boolean
    ownedByCaller: boolean
    canEdit: boolean
    expiresAt?: string
    editor?: {
        userId: string
        businessName?: string
        email?: string
    }
}

type TeamEstimateSessionRow = {
    estimate_id: string
    workspace_id: string
    editor_user_id: string
    acquired_at: string
    heartbeat_at: string
    expires_at: string
    created_at: string
    updated_at: string
}

function isActiveSession(expiresAt: string | null | undefined): boolean {
    if (!expiresAt) return false
    const expires = Date.parse(expiresAt)
    return Number.isFinite(expires) && expires > Date.now()
}

function toMoney(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return 0
}

function toSafeString(value: unknown): string {
    return typeof value === "string" ? value : ""
}

function normalizeStatus(value: unknown): "draft" | "sent" | "paid" {
    return value === "sent" || value === "paid" ? value : "draft"
}

function mapEstimateItem(input: Record<string, unknown>, index: number): TeamEstimateItem {
    return {
        id: toSafeString(input.id).trim() || `item-${index + 1}`,
        itemNumber: typeof input.itemNumber === "number" && Number.isFinite(input.itemNumber)
            ? Math.max(1, Math.floor(input.itemNumber))
            : index + 1,
        category: toSafeString(input.category).trim() || "PARTS",
        description: toSafeString(input.description).trim(),
        quantity: toMoney(input.quantity),
        unit: toSafeString(input.unit).trim() || "ea",
        unit_price: toMoney(input.unit_price),
        total: toMoney(input.total),
    }
}

function mapEstimateSection(input: Record<string, unknown>, index: number): TeamEstimateSection {
    const rawItems = Array.isArray(input.items) ? input.items : []
    return {
        id: toSafeString(input.id).trim() || `section-${index + 1}`,
        name: toSafeString(input.name).trim() || `Section ${index + 1}`,
        ...(toSafeString(input.divisionCode).trim() ? { divisionCode: toSafeString(input.divisionCode).trim() } : {}),
        items: rawItems
            .filter((value): value is Record<string, unknown> => value !== null && typeof value === "object")
            .map((value, itemIndex) => mapEstimateItem(value, itemIndex))
            .filter((item) => item.description !== ""),
    }
}

function mapCloudEstimateToDetail(estimate: Record<string, any>): TeamEstimateDetail {
    const rawFlatItems = Array.isArray(estimate.estimate_items) ? estimate.estimate_items : []
    const rawSections = Array.isArray(estimate.estimate_sections) ? estimate.estimate_sections : []

    const items = rawFlatItems.map((item, index) =>
        mapEstimateItem({
            id: item?.id,
            itemNumber: item?.item_number,
            category: item?.category,
            description: item?.description,
            quantity: item?.quantity,
            unit: item?.unit,
            unit_price: item?.unit_price,
            total: item?.total,
        }, index)
    )

    const sections = rawSections.map((section, sectionIndex) =>
        mapEstimateSection({
            id: section?.local_id || section?.id,
            name: section?.name,
            divisionCode: section?.division_code,
            items: Array.isArray(section?.estimate_section_items)
                ? section.estimate_section_items.map((item: any) => ({
                    id: item?.local_id || item?.id,
                    itemNumber: item?.item_number,
                    category: item?.category,
                    description: item?.description,
                    quantity: item?.quantity,
                    unit: item?.unit,
                    unit_price: item?.unit_price,
                    total: item?.total,
                }))
                : [],
        }, sectionIndex)
    ).filter((section) => section.items.length > 0)

    return {
        estimateId: toSafeString(estimate.id),
        estimateNumber: toSafeString(estimate.estimate_number),
        ownerUserId: toSafeString(estimate.user_id),
        ...(toSafeString(estimate?.profiles?.business_name).trim()
            ? { ownerBusinessName: toSafeString(estimate.profiles.business_name).trim() }
            : {}),
        clientName: toSafeString(estimate?.clients?.name).trim() || "Walk-in Client",
        clientAddress: toSafeString(estimate?.clients?.address).trim(),
        summary_note: toSafeString(estimate.ai_summary),
        status: normalizeStatus(estimate.status),
        taxRate: toMoney(estimate.tax_rate),
        taxAmount: toMoney(estimate.tax_amount),
        totalAmount: toMoney(estimate.total_amount),
        createdAt: toSafeString(estimate.created_at),
        updatedAt: toSafeString(estimate.updated_at) || toSafeString(estimate.created_at),
        ...(toSafeString(estimate.sent_at) ? { sentAt: toSafeString(estimate.sent_at) } : {}),
        items,
        ...(sections.length > 0 ? { sections } : {}),
    }
}

async function resolveClientIdForEstimateOwner(
    supabase: ServiceSupabaseClient,
    ownerUserId: string,
    clientName: string,
    clientAddress: string
): Promise<{ clientId: string | null; error: string | null }> {
    const trimmedName = clientName.trim()
    if (!trimmedName || trimmedName === "Walk-in Client") {
        return { clientId: null, error: null }
    }

    const existing = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", ownerUserId)
        .eq("name", trimmedName)
        .limit(1)
        .maybeSingle()

    if (existing.error) {
        return { clientId: null, error: existing.error.message || "Failed to resolve Team estimate client" }
    }

    if (existing.data?.id) {
        return { clientId: existing.data.id, error: null }
    }

    const inserted = await supabase
        .from("clients")
        .insert({
            user_id: ownerUserId,
            name: trimmedName,
            address: clientAddress.trim() || null,
        })
        .select("id")
        .single()

    if (inserted.error) {
        return { clientId: null, error: inserted.error.message || "Failed to create Team estimate client" }
    }

    return { clientId: inserted.data?.id || null, error: null }
}

async function getWorkspaceMemberUserIds(
    supabase: ServiceSupabaseClient,
    workspaceId: string
): Promise<{ userIds: string[]; error: string | null }> {
    const members = await supabase
        .from("team_workspace_members")
        .select("user_id")
        .eq("workspace_id", workspaceId)

    if (members.error) {
        return { userIds: [], error: members.error.message || "Failed to load Team workspace members" }
    }

    const userIds = Array.isArray(members.data)
        ? members.data
            .map((member: any) => (typeof member?.user_id === "string" ? member.user_id : ""))
            .filter(Boolean)
        : []

    return { userIds, error: null }
}

export async function resolveTeamEstimateAccess(
    supabase: ServiceSupabaseClient,
    userId: string,
    estimateId: string
): Promise<
    | { ok: true; workspaceId: string; estimate: Record<string, any> }
    | { ok: false; status: number; error: string }
> {
    const membership = await getWorkspaceMembershipByUser(supabase, userId)
    if (membership.error) return { ok: false, status: 500, error: membership.error }
    if (!membership.data) return { ok: false, status: 403, error: "You are not part of a Team workspace." }

    const memberIds = await getWorkspaceMemberUserIds(supabase, membership.data.workspace_id)
    if (memberIds.error) return { ok: false, status: 500, error: memberIds.error }

    const estimateResult = await supabase
        .from("estimates")
        .select(`
            id,
            user_id,
            estimate_number,
            total_amount,
            tax_rate,
            tax_amount,
            ai_summary,
            created_at,
            updated_at,
            sent_at,
            status,
            estimate_items (
                id,
                item_number,
                category,
                unit,
                description,
                quantity,
                unit_price,
                total
            ),
            estimate_sections (
                id,
                local_id,
                division_code,
                name,
                sort_order,
                estimate_section_items (
                    id,
                    local_id,
                    item_number,
                    category,
                    unit,
                    description,
                    quantity,
                    unit_price,
                    total
                )
            ),
            clients (name, address),
            profiles (business_name)
        `)
        .eq("id", estimateId)
        .maybeSingle()

    if (estimateResult.error) {
        return { ok: false, status: 500, error: estimateResult.error.message || "Failed to load Team estimate" }
    }

    if (!estimateResult.data) {
        return { ok: false, status: 404, error: "Estimate not found." }
    }

    if (!memberIds.userIds.includes(estimateResult.data.user_id)) {
        return { ok: false, status: 403, error: "Estimate is not shared with your Team workspace." }
    }

    return {
        ok: true,
        workspaceId: membership.data.workspace_id,
        estimate: estimateResult.data,
    }
}

export async function getTeamEstimateDetail(
    supabase: ServiceSupabaseClient,
    userId: string,
    estimateId: string
): Promise<
    | { ok: true; workspaceId: string; estimate: TeamEstimateDetail }
    | { ok: false; status: number; error: string }
> {
    const access = await resolveTeamEstimateAccess(supabase, userId, estimateId)
    if (!access.ok) return access

    return {
        ok: true,
        workspaceId: access.workspaceId,
        estimate: mapCloudEstimateToDetail(access.estimate),
    }
}

async function getRawSession(
    supabase: ServiceSupabaseClient,
    estimateId: string
): Promise<{ session: TeamEstimateSessionRow | null; error: string | null }> {
    const result = await supabase
        .from("team_estimate_sessions")
        .select("estimate_id, workspace_id, editor_user_id, acquired_at, heartbeat_at, expires_at, created_at, updated_at")
        .eq("estimate_id", estimateId)
        .maybeSingle()

    return {
        session: (result.data as TeamEstimateSessionRow | null) ?? null,
        error: result.error ? result.error.message || "Failed to load Team editing session" : null,
    }
}

async function resolveEditorProfile(
    supabase: ServiceSupabaseClient,
    userId: string
): Promise<{ businessName?: string; email?: string }> {
    const result = await supabase
        .from("profiles")
        .select("business_name, email")
        .eq("id", userId)
        .maybeSingle()

    if (result.error || !result.data) return {}

    return {
        ...(toSafeString(result.data.business_name).trim() ? { businessName: toSafeString(result.data.business_name).trim() } : {}),
        ...(toSafeString(result.data.email).trim() ? { email: toSafeString(result.data.email).trim() } : {}),
    }
}

export async function getTeamEstimateSessionState(
    supabase: ServiceSupabaseClient,
    userId: string,
    estimateId: string
): Promise<
    | { ok: true; session: TeamEstimateSessionState }
    | { ok: false; status: number; error: string }
> {
    const access = await resolveTeamEstimateAccess(supabase, userId, estimateId)
    if (!access.ok) return access

    const raw = await getRawSession(supabase, estimateId)
    if (raw.error) return { ok: false, status: 500, error: raw.error }

    if (!raw.session || !isActiveSession(raw.session.expires_at)) {
        return {
            ok: true,
            session: {
                estimateId,
                active: false,
                ownedByCaller: false,
                canEdit: true,
            },
        }
    }

    const ownedByCaller = raw.session.editor_user_id === userId
    const editorProfile = await resolveEditorProfile(supabase, raw.session.editor_user_id)

    return {
        ok: true,
        session: {
            estimateId,
            active: true,
            ownedByCaller,
            canEdit: ownedByCaller,
            expiresAt: raw.session.expires_at,
            editor: {
                userId: raw.session.editor_user_id,
                ...editorProfile,
            },
        },
    }
}

async function persistSession(
    supabase: ServiceSupabaseClient,
    input: {
        estimateId: string
        workspaceId: string
        userId: string
        expiresAt: string
        acquiredAt: string
    }
): Promise<{ error: string | null }> {
    const result = await supabase
        .from("team_estimate_sessions")
        .upsert({
            estimate_id: input.estimateId,
            workspace_id: input.workspaceId,
            editor_user_id: input.userId,
            acquired_at: input.acquiredAt,
            heartbeat_at: new Date().toISOString(),
            expires_at: input.expiresAt,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: "estimate_id",
        })

    return { error: result.error ? result.error.message || "Failed to persist Team editing session" : null }
}

export async function mutateTeamEstimateSession(
    supabase: ServiceSupabaseClient,
    input: {
        userId: string
        estimateId: string
        action: "claim" | "heartbeat" | "release" | "takeover"
    }
): Promise<
    | { ok: true; session: TeamEstimateSessionState }
    | { ok: false; status: number; error: string }
> {
    const access = await resolveTeamEstimateAccess(supabase, input.userId, input.estimateId)
    if (!access.ok) return access

    const raw = await getRawSession(supabase, input.estimateId)
    if (raw.error) return { ok: false, status: 500, error: raw.error }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + TEAM_EDIT_SESSION_TTL_MS).toISOString()
    const hasActiveOtherEditor = raw.session
        && isActiveSession(raw.session.expires_at)
        && raw.session.editor_user_id !== input.userId

    if (input.action === "claim") {
        if (hasActiveOtherEditor) {
            return { ok: false, status: 409, error: "Another editor currently holds this Team estimate." }
        }

        const acquiredAt = raw.session?.editor_user_id === input.userId && raw.session.acquired_at
            ? raw.session.acquired_at
            : now.toISOString()

        const persisted = await persistSession(supabase, {
            estimateId: input.estimateId,
            workspaceId: access.workspaceId,
            userId: input.userId,
            acquiredAt,
            expiresAt,
        })

        if (persisted.error) return { ok: false, status: 500, error: persisted.error }
        return getTeamEstimateSessionState(supabase, input.userId, input.estimateId)
    }

    if (input.action === "takeover") {
        const persisted = await persistSession(supabase, {
            estimateId: input.estimateId,
            workspaceId: access.workspaceId,
            userId: input.userId,
            acquiredAt: now.toISOString(),
            expiresAt,
        })

        if (persisted.error) return { ok: false, status: 500, error: persisted.error }
        return getTeamEstimateSessionState(supabase, input.userId, input.estimateId)
    }

    if (!raw.session || !isActiveSession(raw.session.expires_at) || raw.session.editor_user_id !== input.userId) {
        return { ok: false, status: 409, error: "You do not hold the active Team editing session." }
    }

    if (input.action === "heartbeat") {
        const persisted = await persistSession(supabase, {
            estimateId: input.estimateId,
            workspaceId: access.workspaceId,
            userId: input.userId,
            acquiredAt: raw.session.acquired_at,
            expiresAt,
        })

        if (persisted.error) return { ok: false, status: 500, error: persisted.error }
        return getTeamEstimateSessionState(supabase, input.userId, input.estimateId)
    }

    const releaseResult = await supabase
        .from("team_estimate_sessions")
        .update({
            expires_at: new Date(Date.now() - 1000).toISOString(),
            heartbeat_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("estimate_id", input.estimateId)

    if (releaseResult.error) {
        return { ok: false, status: 500, error: releaseResult.error.message || "Failed to release Team editing session" }
    }

    return getTeamEstimateSessionState(supabase, input.userId, input.estimateId)
}

export async function saveTeamEstimateFromPayload(
    supabase: ServiceSupabaseClient,
    input: {
        userId: string
        estimateId: string
        payload: {
            clientName: string
            clientAddress?: string
            summary_note: string
            status: "draft" | "sent" | "paid"
            taxRate: number
            taxAmount: number
            totalAmount: number
            sentAt?: string
            items: TeamEstimateItem[]
            sections?: TeamEstimateSection[]
        }
    }
): Promise<
    | { ok: true; estimate: TeamEstimateDetail }
    | { ok: false; status: number; error: string }
> {
    const access = await resolveTeamEstimateAccess(supabase, input.userId, input.estimateId)
    if (!access.ok) return access

    const session = await getTeamEstimateSessionState(supabase, input.userId, input.estimateId)
    if (!session.ok) return session
    if (!session.session.active || !session.session.ownedByCaller) {
        return { ok: false, status: 409, error: "You must claim the Team editing session before saving." }
    }

    const ownerUserId = toSafeString(access.estimate.user_id)
    const clientResolution = await resolveClientIdForEstimateOwner(
        supabase,
        ownerUserId,
        input.payload.clientName,
        input.payload.clientAddress || ""
    )

    if (clientResolution.error) {
        return { ok: false, status: 500, error: clientResolution.error }
    }

    const now = new Date().toISOString()
    const updateResult = await supabase
        .from("estimates")
        .update({
            client_id: clientResolution.clientId,
            ai_summary: input.payload.summary_note,
            status: input.payload.status,
            tax_rate: input.payload.taxRate,
            tax_amount: input.payload.taxAmount,
            total_amount: input.payload.totalAmount,
            sent_at: input.payload.status === "sent" || input.payload.status === "paid"
                ? (input.payload.sentAt || access.estimate.sent_at || now)
                : null,
            updated_at: now,
        })
        .eq("id", input.estimateId)

    if (updateResult.error) {
        return { ok: false, status: 500, error: updateResult.error.message || "Failed to update Team estimate" }
    }

    const deleteFlatItems = await supabase.from("estimate_items").delete().eq("estimate_id", input.estimateId)
    if (deleteFlatItems.error) {
        return { ok: false, status: 500, error: deleteFlatItems.error.message || "Failed to refresh Team estimate items" }
    }

    if (input.payload.items.length > 0) {
        const insertFlatItems = await supabase
            .from("estimate_items")
            .insert(input.payload.items.map((item) => ({
                estimate_id: input.estimateId,
                item_number: item.itemNumber,
                category: item.category,
                unit: item.unit,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total,
            })))

        if (insertFlatItems.error) {
            return { ok: false, status: 500, error: insertFlatItems.error.message || "Failed to store Team estimate items" }
        }
    }

    const deleteSections = await supabase.from("estimate_sections").delete().eq("estimate_id", input.estimateId)
    if (deleteSections.error) {
        return { ok: false, status: 500, error: deleteSections.error.message || "Failed to refresh Team estimate sections" }
    }

    if (Array.isArray(input.payload.sections) && input.payload.sections.length > 0) {
        const insertedSections = await supabase
            .from("estimate_sections")
            .insert(input.payload.sections.map((section, index) => ({
                estimate_id: input.estimateId,
                local_id: section.id,
                division_code: section.divisionCode || null,
                name: section.name,
                sort_order: index,
                updated_at: now,
            })))
            .select("id, local_id")

        if (insertedSections.error) {
            return { ok: false, status: 500, error: insertedSections.error.message || "Failed to store Team estimate sections" }
        }

        const sectionIdByLocalId = new Map<string, string>()
        for (const row of insertedSections.data || []) {
            if (typeof row?.local_id === "string" && typeof row?.id === "string") {
                sectionIdByLocalId.set(row.local_id, row.id)
            }
        }

        const sectionItems = input.payload.sections.flatMap((section) => {
            const sectionId = sectionIdByLocalId.get(section.id)
            if (!sectionId) return []
            return section.items.map((item) => ({
                estimate_id: input.estimateId,
                section_id: sectionId,
                local_id: item.id,
                item_number: item.itemNumber,
                category: item.category,
                unit: item.unit,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total,
                updated_at: now,
            }))
        })

        if (sectionItems.length > 0) {
            const insertSectionItems = await supabase.from("estimate_section_items").insert(sectionItems)
            if (insertSectionItems.error) {
                return { ok: false, status: 500, error: insertSectionItems.error.message || "Failed to store Team estimate section items" }
            }
        }
    }

    return getTeamEstimateDetail(supabase, input.userId, input.estimateId)
}
