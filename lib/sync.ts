import { supabase } from './supabase'
import { getEstimates, saveEstimate, LocalEstimate } from './estimates-storage' // Correct imports
import { toast } from '@/components/toast' // Use existing toast component

async function resolveClientId(userId: string, estimate: LocalEstimate): Promise<string | null> {
    const clientName = estimate.clientName?.trim()
    if (!clientName || clientName === "Walk-in Client") return null

    const { data: existingClient, error: fetchError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .eq('name', clientName)
        .limit(1)
        .maybeSingle()

    if (fetchError) {
        console.error("Failed to fetch client for sync:", fetchError)
        return null
    }

    if (existingClient?.id) return existingClient.id

    const { data: newClient, error: insertError } = await supabase
        .from('clients')
        .insert({
            user_id: userId,
            name: clientName,
            address: estimate.clientAddress?.trim() || null,
        })
        .select('id')
        .single()

    if (insertError) {
        console.error("Failed to create client for sync:", insertError)
        return null
    }

    return newClient?.id || null
}

export async function syncEstimates() {
    if (!navigator.onLine) return

    // 1. Auth Check - get user and ensure session
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

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
                    original_transcript
                ),
                clients (name, address)
            `)
            .eq('user_id', user.id)

        if (pullError) throw pullError

        const cloudMap = new Map<string, any>()
        for (const c of cloudEstimatesRaw || []) {
            cloudMap.set(c.id, c)
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
                pushedToCloudCount++
                continue
            }

            // Conflict Resolution via Timestamp
            const localDate = new Date(local.updatedAt || local.createdAt).getTime()
            const cloudDate = new Date(cloud.updated_at || cloud.created_at).getTime()

            if (localDate > cloudDate + 1000) { // Add 1s buffer for precision 
                // Local is newer: PUSH
                await pushEstimateToCloud(user.id, local)
                pushedToCloudCount++
            } else if (cloudDate > localDate + 1000) {
                // Cloud is newer: PULL (will be handled by the pull loop below)
            } else {
                // Same? Just ensure local synced flag is true if it was false
                if (local.synced === false) {
                    await saveEstimate({ ...local, synced: true })
                }
            }
        }

        // Handle Cloud entries (Pull missing ones OR update older local ones)
        for (const cloud of cloudEstimatesRaw || []) {
            const local = localEstimates.find(l => l.id === cloud.id)

            const cloudDate = new Date(cloud.updated_at || cloud.created_at).getTime()
            const localDate = local ? new Date(local.updatedAt || local.createdAt).getTime() : 0

            if (!local || cloudDate > localDate + 1000) {
                // Convert cloud shape to local shape
                const localEst = convertCloudToLocal(cloud)
                await saveEstimate(localEst)
                updatedLocalCount++
            }
        }

        if (updatedLocalCount > 0 || pushedToCloudCount > 0) {
            toast(`Sync complete: ${pushedToCloudCount} up, ${updatedLocalCount} down`, "success")
        }

    } catch (err) {
        console.error("Sync failed:", err)
        toast("Sync failed. Checking network...", "error")
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
        .upsert({
            id: estimate.id,
            user_id: userId,
            client_id: clientId,
            estimate_number: estimate.estimateNumber,
            total_amount: estimate.totalAmount,
            tax_rate: estimate.taxRate,
            tax_amount: estimate.taxAmount,
            ai_summary: estimate.summary_note,
            created_at: estimate.createdAt,
            updated_at: estimate.updatedAt || estimate.createdAt || now,
            sent_at: (estimate.status === 'sent' || estimate.status === 'paid')
                ? (estimate.sentAt || estimate.createdAt)
                : null,
            status: estimate.status,
        })

    if (estError) throw estError

    // 2. Refresh Items
    await supabase.from('estimate_items').delete().eq('estimate_id', estimate.id)
    if (estimate.items.length > 0) {
        await supabase.from('estimate_items').insert(
            estimate.items.map(item => ({
                estimate_id: estimate.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total
            }))
        )
    }

    // 3. Refresh Sections
    await supabase.from('estimate_sections').delete().eq('estimate_id', estimate.id)
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
            return section.items.map(item => ({
                estimate_id: estimate.id,
                section_id: sectionId,
                local_id: item.id,
                item_number: item.itemNumber ?? 0,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total,
                updated_at: now
            }))
        })

        if (sectionItems.length > 0) {
            await supabase.from('estimate_section_items').insert(sectionItems)
        }
    }

    // 4. Update local flag
    await saveEstimate({ ...estimate, synced: true })
}

/**
 * Helpers to convert cloud schema back to local schema.
 */
function convertCloudToLocal(c: any): LocalEstimate {
    return {
        id: c.id,
        estimateNumber: c.estimate_number || "EST-000",
        clientName: c.clients?.name || "Unknown",
        clientAddress: c.clients?.address || "",
        taxRate: c.tax_rate ?? 13,
        taxAmount: c.tax_amount ?? 0,
        totalAmount: c.total_amount ?? 0,
        summary_note: c.ai_summary || "",
        createdAt: c.created_at,
        updatedAt: c.updated_at || c.created_at,
        sentAt: c.sent_at || undefined,
        synced: true,
        status: c.status || 'draft',
        items: (c.estimate_items || []).map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.total
        })),
        sections: c.estimate_sections?.map((s: any) => ({
            id: s.local_id || s.id,
            divisionCode: s.division_code || undefined,
            name: s.name,
            items: s.estimate_section_items?.map((item: any) => ({
                id: item.local_id || crypto.randomUUID(),
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total
            })) || []
        }))
    }
}

