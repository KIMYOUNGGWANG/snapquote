import { supabase } from './supabase'
import { getEstimates, saveEstimate, LocalEstimate } from './estimates-storage' // Correct imports
import { resolveLwwSyncAction } from './sync-resolution'
import {
    applyCloudCustomerPortalLinkToLocalEstimate,
    applyCloudQuickBooksLinkToLocalEstimate,
    assertSupabaseMutation,
    hasCustomerPortalEstimatePatchChanged,
    hasQuickBooksEstimatePatchChanged,
    mapCloudCustomerPortalLinkToLocalPatch,
    mapLocalEstimateAttachmentsToCloudRow,
    mapLocalEstimateItemToCloudRow,
    mapLocalEstimateSectionItemToCloudRow,
    mapLocalEstimateToCloudRow,
    mapCloudEstimateToLocal,
    selectLatestCloudCustomerPortalLink,
    type CloudCustomerPortalLinkRow,
    type CloudEstimateRow,
    type CloudQuickBooksInvoiceLinkRow,
    mapCloudQuickBooksLinkToLocalPatch,
} from './sync-estimate-mapping'

export type SyncEstimatesResult =
    | {
        status: "synced"
        pushedToCloudCount: number
        updatedLocalCount: number
      }
    | {
        status: "offline" | "unauthenticated"
        pushedToCloudCount: 0
        updatedLocalCount: 0
      }

class SyncAuthRequiredError extends Error {
    constructor(message = "Authentication is required to sync estimates.") {
        super(message)
        this.name = "SyncAuthRequiredError"
    }
}

function isJwtLikeAccessToken(accessToken: string | null | undefined): accessToken is string {
    if (!accessToken) return false

    const parts = accessToken.split(".")
    return parts.length === 3 && parts.every((part) => part.trim().length > 0)
}

function getSyncErrorDetail(error: unknown, key: "code" | "message" | "status"): string {
    if (!error || typeof error !== "object") return ""

    const value = (error as Record<string, unknown>)[key]
    return typeof value === "string" || typeof value === "number" ? String(value) : ""
}

function isAuthSyncError(error: unknown) {
    if (error instanceof SyncAuthRequiredError) return true

    const code = getSyncErrorDetail(error, "code")
    const status = getSyncErrorDetail(error, "status")
    const message = getSyncErrorDetail(error, "message").toLowerCase()

    return code === "PGRST301" ||
        status === "401" ||
        status === "403" ||
        message.includes("jwt") ||
        message.includes("unauthorized") ||
        message.includes("invalid login credentials")
}

function getClientContactPatch(estimate: LocalEstimate) {
    const address = estimate.clientAddress?.trim()
    const email = estimate.clientEmail?.trim()
    const phone = estimate.clientPhone?.trim()
    const notes = estimate.clientNotes?.trim()

    return {
        ...(address && address !== "N/A" ? { address } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(notes ? { notes } : {}),
    }
}

function hasClientContactPatchChanged(
    current: Record<string, unknown> | null | undefined,
    patch: Record<string, string>
) {
    return Object.entries(patch).some(([key, value]) => {
        const currentValue = typeof current?.[key] === "string" ? current[key].trim() : ""
        return currentValue !== value
    })
}

async function resolveClientId(userId: string, estimate: LocalEstimate): Promise<string | null> {
    const clientName = estimate.clientName?.trim()
    if (!clientName || clientName === "Walk-in Client") return null
    const contactPatch = getClientContactPatch(estimate)

    const { data: existingClient, error: fetchError } = await supabase
        .from('clients')
        .select('id, address, email, phone, notes')
        .eq('user_id', userId)
        .eq('name', clientName)
        .limit(1)
        .maybeSingle()

    if (fetchError) {
        if (isAuthSyncError(fetchError)) throw new SyncAuthRequiredError()

        console.warn("Failed to fetch client for sync:", fetchError)
        return null
    }

    if (existingClient?.id) {
        if (
            Object.keys(contactPatch).length > 0 &&
            hasClientContactPatchChanged(existingClient as Record<string, unknown>, contactPatch)
        ) {
            const { error: updateError } = await supabase
                .from('clients')
                .update(contactPatch)
                .eq('id', existingClient.id)
                .eq('user_id', userId)

            if (updateError) {
                if (isAuthSyncError(updateError)) throw new SyncAuthRequiredError()

                console.warn("Failed to update client contact for sync:", updateError)
            }
        }

        return existingClient.id
    }

    const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
            user_id: userId,
            name: clientName,
            ...contactPatch,
        })
        .select('id')
        .single()

    if (insertError) {
        if (isAuthSyncError(insertError)) throw new SyncAuthRequiredError()

        console.warn("Failed to create client for sync:", insertError)
        return null
    }

    return newClient?.id || null
}

export async function syncEstimates(): Promise<SyncEstimatesResult> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        return {
            status: "offline",
            pushedToCloudCount: 0,
            updatedLocalCount: 0,
        }
    }

    // 1. Auth Check - get user and ensure session
    const { data: { session } } = await supabase.auth.getSession()
    if (!isJwtLikeAccessToken(session?.access_token)) {
        return {
            status: "unauthenticated",
            pushedToCloudCount: 0,
            updatedLocalCount: 0,
        }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (isAuthSyncError(userError)) {
        return {
            status: "unauthenticated",
            pushedToCloudCount: 0,
            updatedLocalCount: 0,
        }
    }

    if (!user) {
        return {
            status: "unauthenticated",
            pushedToCloudCount: 0,
            updatedLocalCount: 0,
        }
    }

    try {
        // ==========================================
        // FETCH DATA FOR COMPARISON
        // ==========================================
        const localEstimates = await getEstimates()
        const { data: cloudEstimatesRaw, error: pullError } = await supabase
            .from('estimates')
            .select(`
                *,
                estimate_items (*),
                estimate_sections (
                    id,
                    local_id,
                    division_code,
                    name,
                    sort_order,
                    estimate_section_items (
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
                estimate_attachments (
                    photos,
                    audio_url,
                    original_transcript,
                    scope_assumptions_confirmed_at
                ),
                clients (name, address, email, phone, notes)
            `)
            .eq('user_id', user.id)

        if (pullError) throw pullError

        const { data: quickBooksLinksRaw, error: quickBooksPullError } = await supabase
            .from('quickbooks_invoice_links')
            .select(`
                estimate_id,
                quickbooks_invoice_id,
                quickbooks_customer_id,
                quickbooks_invoice_doc_number,
                quickbooks_invoice_status,
                synced_at
            `)
            .eq('user_id', user.id)

        if (quickBooksPullError) throw quickBooksPullError

        const { data: customerPortalLinksRaw, error: customerPortalPullError } = await supabase
            .from('estimate_share_links')
            .select(`
                estimate_id,
                share_url,
                status,
                viewed_at,
                approved_at,
                change_requested_at,
                customer_name,
                customer_email,
                customer_note,
                created_at,
                updated_at
            `)
            .eq('user_id', user.id)

        if (customerPortalPullError) throw customerPortalPullError

        const cloudMap = new Map<string, CloudEstimateRow>()
        for (const c of cloudEstimatesRaw || []) {
            if (typeof c?.id === "string") {
                cloudMap.set(c.id, c)
            }
        }

        const quickBooksLinkMap = new Map<string, CloudQuickBooksInvoiceLinkRow>()
        for (const link of quickBooksLinksRaw || []) {
            const quickBooksLink = link as CloudQuickBooksInvoiceLinkRow
            if (typeof quickBooksLink.estimate_id === "string" && quickBooksLink.estimate_id.trim()) {
                quickBooksLinkMap.set(quickBooksLink.estimate_id.trim(), quickBooksLink)
            }
        }

        const customerPortalLinkMap = new Map<string, CloudCustomerPortalLinkRow>()
        for (const link of customerPortalLinksRaw || []) {
            const customerPortalLink = link as CloudCustomerPortalLinkRow
            if (typeof customerPortalLink.estimate_id === "string" && customerPortalLink.estimate_id.trim()) {
                const estimateId = customerPortalLink.estimate_id.trim()
                customerPortalLinkMap.set(
                    estimateId,
                    selectLatestCloudCustomerPortalLink(customerPortalLinkMap.get(estimateId), customerPortalLink)
                )
            }
        }

        // ==========================================
        // SYNC LOOP (COMBINED PUSH & PULL)
        // ==========================================
        let updatedLocalCount = 0
        let pushedToCloudCount = 0

        // Handle Local entries (Push vs Skip vs Pull update)
        for (const local of localEstimates) {
            const cloud = cloudMap.get(local.id)

            if (!cloud) {
                // Not on cloud yet? PUSH
                await pushEstimateToCloud(user.id, local)
                const quickBooksPatch = mapCloudQuickBooksLinkToLocalPatch(quickBooksLinkMap.get(local.id))
                const customerPortalPatch = mapCloudCustomerPortalLinkToLocalPatch(customerPortalLinkMap.get(local.id))
                if (
                    hasQuickBooksEstimatePatchChanged(local, quickBooksPatch) ||
                    hasCustomerPortalEstimatePatchChanged(local, customerPortalPatch)
                ) {
                    await saveEstimate({
                        ...local,
                        ...(quickBooksPatch || {}),
                        ...(customerPortalPatch || {}),
                        synced: true,
                    })
                    updatedLocalCount++
                }
                pushedToCloudCount++
                continue
            }

            const syncAction = resolveLwwSyncAction({
                localUpdatedAt: local.updatedAt,
                localCreatedAt: local.createdAt,
                cloudUpdatedAt: typeof cloud.updated_at === "string" ? cloud.updated_at : undefined,
                cloudCreatedAt: typeof cloud.created_at === "string" ? cloud.created_at : undefined,
            })

            if (syncAction === 'push') {
                // Local is newer: PUSH
                await pushEstimateToCloud(user.id, local)
                const quickBooksPatch = mapCloudQuickBooksLinkToLocalPatch(quickBooksLinkMap.get(local.id))
                const customerPortalPatch = mapCloudCustomerPortalLinkToLocalPatch(customerPortalLinkMap.get(local.id))
                if (
                    hasQuickBooksEstimatePatchChanged(local, quickBooksPatch) ||
                    hasCustomerPortalEstimatePatchChanged(local, customerPortalPatch)
                ) {
                    await saveEstimate({
                        ...local,
                        ...(quickBooksPatch || {}),
                        ...(customerPortalPatch || {}),
                        synced: true,
                    })
                    updatedLocalCount++
                }
                pushedToCloudCount++
            } else if (syncAction === 'pull') {
                // Cloud is newer: PULL (will be handled by the pull loop below)
            } else {
                // Same? Just ensure local synced flag is true if it was false
                const quickBooksPatch = mapCloudQuickBooksLinkToLocalPatch(quickBooksLinkMap.get(local.id))
                const customerPortalPatch = mapCloudCustomerPortalLinkToLocalPatch(customerPortalLinkMap.get(local.id))
                if (
                    hasQuickBooksEstimatePatchChanged(local, quickBooksPatch) ||
                    hasCustomerPortalEstimatePatchChanged(local, customerPortalPatch)
                ) {
                    await saveEstimate({
                        ...local,
                        ...(quickBooksPatch || {}),
                        ...(customerPortalPatch || {}),
                        synced: true,
                    })
                    updatedLocalCount++
                } else if (local.synced === false) {
                    await saveEstimate({ ...local, synced: true })
                }
            }
        }

        // Handle Cloud entries (Pull missing ones OR update older local ones)
        for (const cloud of cloudEstimatesRaw || []) {
            const local = localEstimates.find(l => l.id === cloud.id)

            const syncAction = local
                ? resolveLwwSyncAction({
                    localUpdatedAt: local.updatedAt,
                    localCreatedAt: local.createdAt,
                    cloudUpdatedAt: typeof cloud.updated_at === "string" ? cloud.updated_at : undefined,
                    cloudCreatedAt: typeof cloud.created_at === "string" ? cloud.created_at : undefined,
                })
                : 'pull'

            if (!local || syncAction === 'pull') {
                // Convert cloud shape to local shape
                const cloudId = typeof cloud.id === "string" ? cloud.id : ""
                const localEst = applyCloudCustomerPortalLinkToLocalEstimate(
                    applyCloudQuickBooksLinkToLocalEstimate(
                        mapCloudEstimateToLocal(cloud),
                        quickBooksLinkMap.get(cloudId)
                    ),
                    customerPortalLinkMap.get(cloudId)
                )
                await saveEstimate(localEst)
                updatedLocalCount++
            }
        }

        if (updatedLocalCount > 0 || pushedToCloudCount > 0) {
            console.info(`Sync complete: ${pushedToCloudCount} up, ${updatedLocalCount} down`)
        }

        return {
            status: "synced",
            pushedToCloudCount,
            updatedLocalCount,
        }
    } catch (err) {
        if (isAuthSyncError(err)) {
            return {
                status: "unauthenticated",
                pushedToCloudCount: 0,
                updatedLocalCount: 0,
            }
        }

        console.error("Sync failed:", err)
        throw err
    }
}

/**
 * Pushes a local estimate to Supabase.
 */
async function pushEstimateToCloud(userId: string, estimate: LocalEstimate) {
    const clientId = await resolveClientId(userId, estimate)
    const now = new Date().toISOString()

    // 1. Upsert Estimate
    const { error: estError } = await supabase
        .from('estimates')
        .upsert(mapLocalEstimateToCloudRow(userId, clientId, estimate, { now }))

    if (estError) throw estError

    // 2. Refresh Items
    const deleteFlatItems = await supabase.from('estimate_items').delete().eq('estimate_id', estimate.id)
    assertSupabaseMutation(deleteFlatItems, "Failed to refresh estimate items")

    const flatItems = Array.isArray(estimate.items) ? estimate.items : []
    if (flatItems.length > 0) {
        const insertFlatItems = await supabase.from('estimate_items').insert(
            flatItems.map(item => mapLocalEstimateItemToCloudRow(estimate.id, item, { updatedAt: now }))
        )
        assertSupabaseMutation(insertFlatItems, "Failed to store estimate items")
    }

    // 3. Refresh Sections
    const deleteSections = await supabase.from('estimate_sections').delete().eq('estimate_id', estimate.id)
    assertSupabaseMutation(deleteSections, "Failed to refresh estimate sections")

    if (estimate.sections && estimate.sections.length > 0) {
        const { data: insertedSections, error: sectionInsertError } = await supabase
            .from('estimate_sections')
            .insert(estimate.sections.map((s, idx) => ({
                estimate_id: estimate.id,
                local_id: s.id,
                division_code: s.divisionCode ?? null,
                name: s.name,
                sort_order: idx,
                updated_at: now
            })))
            .select('id, local_id')

        if (sectionInsertError) throw sectionInsertError

        const sectionIdByLocalId = new Map<string, string>()
        for (const row of insertedSections || []) {
            if (row?.local_id && row?.id) sectionIdByLocalId.set(row.local_id, row.id)
        }

        const sectionItems = estimate.sections.flatMap(section => {
            const sectionId = sectionIdByLocalId.get(section.id)
            if (!sectionId) return []
            return section.items.map(item =>
                mapLocalEstimateSectionItemToCloudRow(estimate.id, sectionId, item, { updatedAt: now })
            )
        })

        const missingSectionWithItems = estimate.sections.find((section) =>
            section.items.length > 0 && !sectionIdByLocalId.has(section.id)
        )
        if (missingSectionWithItems) {
            throw new Error(`Failed to map synced section "${missingSectionWithItems.name}"`)
        }

        if (sectionItems.length > 0) {
            const insertSectionItems = await supabase.from('estimate_section_items').insert(sectionItems)
            assertSupabaseMutation(insertSectionItems, "Failed to store estimate section items")
        }
    }

    // 4. Refresh Attachments
    const attachmentRow = mapLocalEstimateAttachmentsToCloudRow(estimate.id, estimate.attachments, { updatedAt: now })

    if (attachmentRow) {
        const upsertAttachments = await supabase
            .from('estimate_attachments')
            .upsert(attachmentRow, {
                onConflict: 'estimate_id',
            })
        assertSupabaseMutation(upsertAttachments, "Failed to store estimate attachments")
    } else {
        const deleteAttachments = await supabase.from('estimate_attachments').delete().eq('estimate_id', estimate.id)
        assertSupabaseMutation(deleteAttachments, "Failed to refresh estimate attachments")
    }

    // 5. Update local flag
    await saveEstimate({ ...estimate, synced: true })
}
