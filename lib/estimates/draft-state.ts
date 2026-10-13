import type { LocalEstimate } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate } from "@/lib/estimates/math"

type DraftStatusEstimate = {
    status?: LocalEstimate["status"]
}

type ScopeReviewEstimate = {
    attachments?: Pick<NonNullable<LocalEstimate["attachments"]>, "originalTranscript" | "photos" | "scopeAssumptionsConfirmedAt">
}

export type DraftSendReadinessReason = "capture" | "empty" | "pricing" | "scope"

export type DraftSendReadiness = {
    ready: boolean
    reason: DraftSendReadinessReason | null
    actionLabel: string
    message: string
}

const SCOPE_ACTION_PATTERN = /\b(replace|install|repair|fix|remove|add|test|inspect|service|clean|paint|wire|plumb|frame|patch|seal|mount|connect|diagnos(?:e|is))\b/i
const SCOPE_MATERIAL_PATTERN = /\b(material|part|labor|hour|hr|valve|pipe|wire|fixture|panel|paint|drywall|tile|cartridge|assembly|permit|cleanup|haul|disposal|trim|shutoff|drain|breaker|outlet)\b/i
const SCOPE_CONDITION_PATTERN = /\b(leak\w*|damage|access|under|behind|ceiling|crawl|attic|pressure|height|old|existing|photo|condition|customer|request|around|area|before|after)\b/i

export function isDraftEstimate(estimate: DraftStatusEstimate): boolean {
    return estimate.status === "draft" || !estimate.status
}

export function hasScopeAssumptionsConfirmed(estimate: ScopeReviewEstimate): boolean {
    return Boolean(estimate.attachments?.scopeAssumptionsConfirmedAt?.trim())
}

export function getScopeDetailScore(scopeText: string, hasPhotoScope = false): number {
    const normalizedScopeText = scopeText.trim()
    const scopeWordCount = normalizedScopeText ? normalizedScopeText.split(/\s+/).filter(Boolean).length : 0
    const scopeTextLength = normalizedScopeText.length
    const hasScopeWorkAction = SCOPE_ACTION_PATTERN.test(normalizedScopeText) || scopeTextLength >= 40
    const hasScopeMaterialOrLabor = SCOPE_MATERIAL_PATTERN.test(normalizedScopeText) || scopeWordCount >= 12 || hasPhotoScope
    const hasScopeSiteContext = SCOPE_CONDITION_PATTERN.test(normalizedScopeText) || scopeWordCount >= 18 || hasPhotoScope

    return [hasScopeWorkAction, hasScopeMaterialOrLabor, hasScopeSiteContext].filter(Boolean).length
}

export function needsScopeAssumptionsReview(estimate: ScopeReviewEstimate): boolean {
    if (hasScopeAssumptionsConfirmed(estimate)) return false

    const originalScope = estimate.attachments?.originalTranscript?.trim() || ""
    const hasPhotoScope = (estimate.attachments?.photos?.length || 0) > 0
    if (!originalScope && !hasPhotoScope) return false

    return getScopeDetailScore(originalScope, hasPhotoScope) < 3
}

export function isCaptureOnlyDraft(estimate: LocalEstimate): boolean {
    if (!isDraftEstimate(estimate)) return false
    if (getAllItemsFromEstimate(estimate).length > 0) return false
    if (estimate.totalAmount > 0) return false

    return Boolean(
        estimate.summary_note?.trim()
        || estimate.attachments?.originalTranscript?.trim()
        || (estimate.attachments?.photos?.length || 0) > 0
    )
}

export function getDraftSendReadiness(estimate: LocalEstimate): DraftSendReadiness {
    if (isCaptureOnlyDraft(estimate)) {
        return {
            ready: false,
            reason: "capture",
            actionLabel: "Resume capture",
            message: "Generate the AI draft before marking this capture sent.",
        }
    }

    const items = getAllItemsFromEstimate(estimate)
    if (items.length === 0) {
        return {
            ready: false,
            reason: "empty",
            actionLabel: "Add lines",
            message: "Add line items before marking this draft sent.",
        }
    }

    const missingPriceCount = items.filter((item) => item.unit_price === 0).length
    if (missingPriceCount > 0) {
        return {
            ready: false,
            reason: "pricing",
            actionLabel: "Finish pricing",
            message: `${missingPriceCount} line item${missingPriceCount === 1 ? "" : "s"} still need pricing before sending.`,
        }
    }

    if (needsScopeAssumptionsReview(estimate)) {
        return {
            ready: false,
            reason: "scope",
            actionLabel: "Review scope",
            message: "Review scope assumptions before marking this draft sent.",
        }
    }

    return {
        ready: true,
        reason: null,
        actionLabel: "Mark sent",
        message: "Ready to mark sent.",
    }
}
