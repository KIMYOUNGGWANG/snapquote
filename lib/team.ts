import { withAuthHeaders } from "@/lib/auth-headers"

export interface TeamWorkspaceResponse {
    ok: true
    eligible: boolean
    hasWorkspace: boolean
    workspace?: {
        id: string
        name: string
        role: "owner" | "admin" | "member"
        memberCount: number
        canManage: boolean
    }
    members: Array<{
        userId: string
        role: "owner" | "admin" | "member"
        joinedAt: string
        businessName?: string
        email?: string
    }>
    pendingInvites: Array<{
        inviteId: string
        email: string
        role: "admin" | "member"
        status: "pending" | "accepted" | "revoked" | "expired"
        token: string
        inviteUrl: string
        expiresAt: string
        createdAt: string
    }>
}

export interface TeamEstimatesResponse {
    ok: true
    workspaceId: string
    count: number
    estimates: Array<{
        estimateId: string
        estimateNumber: string
        ownerUserId: string
        ownerBusinessName?: string
        clientName?: string
        status: "draft" | "sent" | "paid"
        totalAmount: number
        updatedAt: string
        createdAt: string
    }>
}

export interface TeamEstimateDetailResponse {
    ok: true
    workspaceId: string
    estimate: {
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
        items: Array<{
            id: string
            itemNumber: number
            category: string
            description: string
            quantity: number
            unit: string
            unit_price: number
            total: number
        }>
        sections?: Array<{
            id: string
            name: string
            divisionCode?: string
            items: Array<{
                id: string
                itemNumber: number
                category: string
                description: string
                quantity: number
                unit: string
                unit_price: number
                total: number
            }>
        }>
    }
}

export interface TeamEstimateSessionResponse {
    ok: true
    session: {
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
}

export async function getTeamWorkspace(): Promise<TeamWorkspaceResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const response = await fetch("/api/team/workspace", {
            method: "GET",
            headers,
            cache: "no-store",
        })

        if (!response.ok) return null
        return (await response.json()) as TeamWorkspaceResponse
    } catch (error) {
        console.error("Failed to load Team workspace:", error)
        return null
    }
}

export async function createTeamInvite(input: { email: string; role?: "admin" | "member" }) {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch("/api/team/invites", {
        method: "POST",
        headers,
        body: JSON.stringify(input),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to create Team invite")
    }

    return payload as {
        ok: true
        invite: TeamWorkspaceResponse["pendingInvites"][number]
    }
}

export async function acceptTeamInvite(token: string) {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch("/api/team/invites/accept", {
        method: "POST",
        headers,
        body: JSON.stringify({ token }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to accept Team invite")
    }

    return payload as {
        ok: true
        joined: boolean
        deduped?: boolean
        workspace: {
            id: string
            name: string
            role: "admin" | "member"
        }
    }
}

export async function getTeamEstimates(limit = 25): Promise<TeamEstimatesResponse | null> {
    try {
        const headers = await withAuthHeaders()
        if (!headers.authorization) return null

        const params = new URLSearchParams({ limit: String(limit) })
        const response = await fetch(`/api/team/estimates?${params.toString()}`, {
            method: "GET",
            headers,
            cache: "no-store",
        })

        if (!response.ok) return null
        return (await response.json()) as TeamEstimatesResponse
    } catch (error) {
        console.error("Failed to load Team estimates:", error)
        return null
    }
}

export async function getTeamEstimateDetail(estimateId: string): Promise<TeamEstimateDetailResponse> {
    const headers = await withAuthHeaders()
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch(`/api/team/estimates/${encodeURIComponent(estimateId)}`, {
        method: "GET",
        headers,
        cache: "no-store",
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to load Team estimate")
    }

    return payload as TeamEstimateDetailResponse
}

export async function getTeamEstimateSession(estimateId: string): Promise<TeamEstimateSessionResponse> {
    const headers = await withAuthHeaders()
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch(`/api/team/estimates/${encodeURIComponent(estimateId)}/session`, {
        method: "GET",
        headers,
        cache: "no-store",
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to load Team session")
    }

    return payload as TeamEstimateSessionResponse
}

export async function mutateTeamEstimateSession(
    estimateId: string,
    action: "claim" | "heartbeat" | "release" | "takeover"
): Promise<TeamEstimateSessionResponse> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch(`/api/team/estimates/${encodeURIComponent(estimateId)}/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to update Team session")
    }

    return payload as TeamEstimateSessionResponse
}

export async function updateTeamEstimate(
    estimateId: string,
    input: {
        clientName: string
        clientAddress?: string
        summary_note: string
        status: "draft" | "sent" | "paid"
        taxRate: number
        taxAmount: number
        totalAmount: number
        sentAt?: string
        items: Array<{
            id: string
            itemNumber: number
            category: string
            description: string
            quantity: number
            unit: string
            unit_price: number
            total: number
        }>
        sections?: Array<{
            id: string
            name: string
            divisionCode?: string
            items: Array<{
                id: string
                itemNumber: number
                category: string
                description: string
                quantity: number
                unit: string
                unit_price: number
                total: number
            }>
        }>
    }
): Promise<{ ok: true; estimate: TeamEstimateDetailResponse["estimate"] }> {
    const headers = await withAuthHeaders({ "content-type": "application/json" })
    if (!headers.authorization) {
        throw new Error("Log in required")
    }

    const response = await fetch(`/api/team/estimates/${encodeURIComponent(estimateId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(input),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        throw new Error(payload?.error?.message || payload?.error || "Failed to update Team estimate")
    }

    return payload as { ok: true; estimate: TeamEstimateDetailResponse["estimate"] }
}
