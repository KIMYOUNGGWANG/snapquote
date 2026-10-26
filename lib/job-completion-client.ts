// Browser orchestration for the job completion report (AI match, finalize, send).
import { withAuthHeaders } from "@/lib/auth-headers"
import {
    createCustomerPortalLinkForEstimate,
    getCustomerPortalEstimateUpdates,
} from "@/lib/customer-portal-client"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"
import { computeBalanceDue } from "@/lib/estimates/balance"
import { getEstimates, saveEstimate, type JobCompletion, type LocalEstimate } from "@/lib/estimates-storage"
import {
    applyExtraWork,
    buildCompletionEmailSubject,
    sanitizeCompletionMatches,
    type CompletionMatchResult,
    type ExtraWorkLine,
} from "@/lib/job-completion"
import { syncEstimates } from "@/lib/sync"

const AI_TIMEOUT_MS = 60_000

export type CompletionMatchOutcome =
    | ({ kind: "matched" } & CompletionMatchResult)
    | { kind: "limit"; message: string }
    | { kind: "failed" }

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

function readErrorMessage(data: unknown, fallback: string): string {
    if (!isRecord(data)) return fallback
    if (typeof data.error === "string" && data.error.trim()) return data.error.trim()
    if (isRecord(data.error) && typeof data.error.message === "string" && data.error.message.trim()) {
        return data.error.message.trim()
    }
    return fallback
}

/** AI photo matching. Any failure (502, timeout, offline) falls back to an all-"?" review. */
export async function requestCompletionMatches(input: {
    items: { itemId: string; description: string }[]
    photos: string[]
    note?: string
}): Promise<CompletionMatchOutcome> {
    if (typeof navigator !== "undefined" && !navigator.onLine) return { kind: "failed" }

    try {
        const response = await fetch("/api/completion-report", {
            method: "POST",
            headers: await withAuthHeaders({ "content-type": "application/json" }),
            body: JSON.stringify({
                items: input.items.slice(0, 300).map((item) => ({
                    itemId: item.itemId,
                    description: item.description.slice(0, 1000),
                })),
                photos: input.photos,
                note: input.note?.trim() ? input.note.trim().slice(0, 2000) : undefined,
            }),
            signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        })
        const data: unknown = await response.json().catch(() => null)

        if (response.status === 402) {
            return { kind: "limit", message: readErrorMessage(data, "Free plan includes 2 completion reports per month.") }
        }
        if (!response.ok) return { kind: "failed" }

        return {
            kind: "matched",
            ...sanitizeCompletionMatches(data, input.items.map((item) => item.itemId), input.photos.length),
        }
    } catch (error) {
        console.warn("Completion report AI matching failed:", error)
        return { kind: "failed" }
    }
}

type FinalizeResponse = {
    amountPaid: number
    balanceDue: number
    paymentLink?: string
    paymentLinkId?: string
    status: LocalEstimate["status"]
    paymentCompletedAt?: string
    updatedAt?: string
}

/** Resume was requested but the saved finalize step is gone: never fall back to a fresh finalize. */
export class CompletionStateLostError extends Error {
    constructor() {
        super("We couldn't find the saved payment step. Close and reopen this job to continue.")
        this.name = "CompletionStateLostError"
    }
}

async function postFinalize(estimateId: string, alreadyReceived: number): Promise<FinalizeResponse> {
    const response = await fetch(`/api/estimates/${encodeURIComponent(estimateId)}/completion`, {
        method: "POST",
        headers: await withAuthHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ alreadyReceived }),
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new Error(readErrorMessage(data, "Couldn't save the payment details. Try again."))
    }
    if (typeof data.amountPaid !== "number" || typeof data.balanceDue !== "number") {
        throw new Error("Completion response was incomplete.")
    }

    // Status is server-owned: apply what the route decided, never infer it.
    const paymentCompletedAt = typeof data.paymentCompletedAt === "string" && data.paymentCompletedAt.trim()
        ? data.paymentCompletedAt
        : undefined
    const status = isEstimatePaidLike({ status: data.status, paymentCompletedAt })
        ? "paid"
        : data.status === "sent" ? "sent" : "draft"

    return {
        amountPaid: data.amountPaid,
        balanceDue: data.balanceDue,
        paymentLink: typeof data.paymentLink === "string" ? data.paymentLink : undefined,
        paymentLinkId: typeof data.paymentLinkId === "string" ? data.paymentLinkId : undefined,
        status,
        paymentCompletedAt,
        updatedAt: typeof data.updatedAt === "string" && data.updatedAt.trim() ? data.updatedAt : undefined,
    }
}

export async function getStoredEstimate(estimateId: string): Promise<LocalEstimate | undefined> {
    return (await getEstimates()).find((entry) => entry.id === estimateId)
}

/**
 * One send: save extra work -> push -> finalize (amount received + balance link) -> portal snapshot -> save locally.
 * Finalize's result is saved locally right away with a `pendingCompletion` marker, so a failure after it
 * resumes at the snapshot step (no second push or finalize). `completion` is stored last: a stored completion
 * means the report was finalized, and a resend never re-finalizes.
 */
export async function finalizeJobCompletion(
    estimate: LocalEstimate,
    input: { completion: JobCompletion; extraWork: ExtraWorkLine[]; alreadyReceived: number },
    options: { resume?: boolean } = {}
): Promise<{ estimate: LocalEstimate; portalUrl: string; balanceDue: number }> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("You're offline. Connect to send the report.")
    }

    let finalized = await getStoredEstimate(estimate.id)
    if (options.resume && !finalized?.pendingCompletion) throw new CompletionStateLostError()
    if (!finalized?.pendingCompletion) {
        // 1. Extra work + recomputed totals, saved locally.
        const withExtraWork: LocalEstimate = {
            ...applyExtraWork(finalized ?? estimate, input.extraWork),
            updatedAt: new Date().toISOString(),
            synced: false,
        }
        await saveEstimate(withExtraWork)

        // 2. Push so the server finalizes against the new total.
        const sync = await syncEstimates()
        if (sync.status !== "synced") {
            throw new Error(sync.status === "offline"
                ? "You're offline. Connect to send the report."
                : "Sign in to send the report.")
        }

        // 3. Record what was received, create the balance link, and keep the server's answer locally at once.
        const result = await postFinalize(estimate.id, input.alreadyReceived)
        finalized = {
            ...withExtraWork,
            status: result.status,
            paymentCompletedAt: result.paymentCompletedAt,
            amountPaid: result.amountPaid,
            paymentLink: result.paymentLink,
            paymentLinkId: result.paymentLinkId,
            paymentLinkType: result.paymentLink ? "custom" : undefined,
            pendingCompletion: { completion: input.completion, amountPaid: result.amountPaid, balanceDue: result.balanceDue },
            // Server's own updated_at: LWW then sees local == cloud and neither pushes nor pulls this row.
            updatedAt: result.updatedAt ?? new Date().toISOString(),
            synced: Boolean(result.updatedAt),
        }
        await saveEstimate(finalized)
    }

    const pending = finalized.pendingCompletion
    if (!pending) throw new Error("Completion state was lost. Try again.")

    // 4. Refresh the portal snapshot without resetting the customer's approval.
    const portal = await createCustomerPortalLinkForEstimate(
        { ...finalized, completion: pending.completion },
        { completion: { amountPaid: pending.amountPaid, balanceDue: pending.balanceDue } }
    )
    const portalUrl = portal.shareUrl
    if (!portalUrl) throw new Error("Customer link was not returned. Try again.")

    // 5. Store the report, then push it in the background.
    const saved: LocalEstimate = {
        ...finalized,
        ...getCustomerPortalEstimateUpdates(portal),
        completion: pending.completion,
        pendingCompletion: undefined,
        updatedAt: new Date().toISOString(),
        synced: false,
    }
    await saveEstimate(saved)
    void syncEstimates().catch((error: unknown) => console.warn("Completion sync deferred:", error))

    return { estimate: saved, portalUrl, balanceDue: pending.balanceDue }
}

/**
 * Resend for a stored report that has no portal URL: re-post the snapshot (no finalize, no push).
 * The record keeps its updatedAt, so sync does not treat this as a local edit.
 */
export async function ensureCompletionPortalUrl(estimate: LocalEstimate): Promise<{ estimate: LocalEstimate; portalUrl: string }> {
    if (estimate.customerPortalUrl) return { estimate, portalUrl: estimate.customerPortalUrl }
    if (!estimate.completion) throw new Error("This job has no completion report yet.")

    const amountPaid = estimate.amountPaid ?? 0
    const portal = await createCustomerPortalLinkForEstimate(estimate, {
        completion: { amountPaid, balanceDue: computeBalanceDue(estimate.totalAmount, amountPaid) },
    })
    if (!portal.shareUrl) throw new Error("Customer link was not returned. Try again.")

    const updates = getCustomerPortalEstimateUpdates(portal)
    const saved: LocalEstimate = {
        ...estimate,
        customerPortalUrl: portal.shareUrl,
        customerPortalStatus: updates.customerPortalStatus,
    }
    await saveEstimate(saved)
    return { estimate: saved, portalUrl: portal.shareUrl }
}

export async function sendCompletionEmail(input: {
    estimateNumber: string
    email: string
    message: string
    clientName?: string
    businessName?: string
}): Promise<"sent" | "mailto"> {
    const response = await fetch("/api/send-email", {
        method: "POST",
        headers: await withAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
            email: input.email.trim(),
            subject: buildCompletionEmailSubject(input.estimateNumber),
            message: input.message,
            clientName: input.clientName,
            businessName: input.businessName,
        }),
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new Error(readErrorMessage(data, "Failed to send email. Please try again."))

    if (isRecord(data) && data.method === "mailto" && typeof data.mailtoUrl === "string") {
        window.open(data.mailtoUrl, "_blank")
        return "mailto"
    }
    if (isRecord(data) && data.success === true) return "sent"
    throw new Error(readErrorMessage(data, "Failed to send email. Please try again."))
}
