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

    // 1. Auth Check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return // Not logged in

    try {
        // toast("Syncing data...", "info") // Optional: notify start

        // ==========================================
        // PUSH: Local -> Cloud
        // ==========================================
        const localEstimates = await getEstimates()
        const unsynced = localEstimates.filter(est => !est.synced)

        for (const estimate of unsynced) {
            const clientId = await resolveClientId(user.id, estimate)

            let didSyncAll = false
            // A. Insert Estimate
            const { error: estError } = await supabase
                .from('estimates')
                .upsert({
                    id: estimate.id,
                    user_id: user.id,
                    client_id: clientId,
                    estimate_number: estimate.estimateNumber,
                    total_amount: estimate.totalAmount,
                    tax_rate: estimate.taxRate,
                    tax_amount: estimate.taxAmount,
                    ai_summary: estimate.summary_note,
                    created_at: estimate.createdAt,
                    sent_at: (estimate.status === 'sent' || estimate.status === 'paid')
                        ? (estimate.sentAt || estimate.createdAt)
                        : null,
                    status: estimate.status === 'paid'
                        ? 'paid'
                        : (estimate.status === 'sent' ? 'sent' : 'draft'),
                })

            if (estError) {
                console.error("Sync push error (Estimate):", estError)
                continue
            }

            // B. Insert Items
            await supabase.from('estimate_items').delete().eq('estimate_id', estimate.id)

            const itemsToInsert = estimate.items.map(item => ({
                estimate_id: estimate.id,
                description: item.description,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total: item.total
            }))

            const { error: itemError } = await supabase.from('estimate_items').insert(itemsToInsert)

            if (itemError) {
                console.error("Sync push error (Items):", itemError)
                continue
            }

            // C. Normalize Sections (optional) - replace existing sections/items for estimate
            const { error: deleteSectionsError } = await supabase
                .from('estimate_sections')
                .delete()
                .eq('estimate_id', estimate.id)

            if (deleteSectionsError) {
                console.error("Sync push error (Delete Sections):", deleteSectionsError)
                continue
            }

            if (estimate.sections && estimate.sections.length > 0) {
                const sectionsToInsert = estimate.sections.map((section, idx) => ({
                    estimate_id: estimate.id,
                    local_id: section.id,
                    division_code: section.divisionCode ?? null,
                    name: section.name,
                    sort_order: idx,
                    updated_at: new Date().toISOString(),
                }))

                const { data: insertedSections, error: sectionInsertError } = await supabase
                    .from('estimate_sections')
                    .insert(sectionsToInsert)
                    .select('id, local_id')

                if (sectionInsertError) {
                    console.error("Sync push error (Insert Sections):", sectionInsertError)
                    continue
                }

                const sectionIdByLocalId = new Map<string, string>()
                for (const row of insertedSections || []) {
                    if (row?.local_id && row?.id) sectionIdByLocalId.set(row.local_id, row.id)
                }

                const sectionItemsToInsert = (estimate.sections || []).flatMap(section => {
                    const sectionId = sectionIdByLocalId.get(section.id)
                    if (!sectionId) return []
                    return (section.items || []).map(item => ({
                        estimate_id: estimate.id,
                        section_id: sectionId,
                        local_id: item.id,
                        item_number: item.itemNumber ?? 0,
                        category: item.category ?? null,
                        unit: item.unit ?? null,
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total: item.total,
                        updated_at: new Date().toISOString(),
                    }))
                })

                if (sectionItemsToInsert.length > 0) {
                    const { error: sectionItemInsertError } = await supabase
                        .from('estimate_section_items')
                        .insert(sectionItemsToInsert)

                    if (sectionItemInsertError) {
                        console.error("Sync push error (Insert Section Items):", sectionItemInsertError)
                        continue
                    }
                }
            }

            // D. Attachments (optional) - store compact original data for dispute prevention
            const { error: deleteAttachmentsError } = await supabase
                .from('estimate_attachments')
                .delete()
                .eq('estimate_id', estimate.id)

            if (deleteAttachmentsError) {
                console.error("Sync push error (Delete Attachments):", deleteAttachmentsError)
                continue
            }

            if (estimate.attachments && (estimate.attachments.photos?.length > 0 || estimate.attachments.originalTranscript || estimate.attachments.audioUrl)) {
                const { error: attachmentInsertError } = await supabase
                    .from('estimate_attachments')
                    .insert({
                        estimate_id: estimate.id,
                        photos: estimate.attachments.photos || [],
                        audio_url: estimate.attachments.audioUrl ?? null,
                        original_transcript: estimate.attachments.originalTranscript ?? null,
                        updated_at: new Date().toISOString(),
                    })

                if (attachmentInsertError) {
                    console.error("Sync push error (Insert Attachments):", attachmentInsertError)
                    continue
                }
            }

            didSyncAll = true

            if (didSyncAll) {
                await saveEstimate({ ...estimate, synced: true })
            }
        }

        // ==========================================
        // PULL: Cloud -> Local
        // ==========================================
        const { data: cloudEstimates, error: pullError } = await supabase
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

        if (cloudEstimates) {
            for (const cloudEst of cloudEstimates) {
                // Convert DB shape to LocalEstimate shape
                const localEst: LocalEstimate = {
                    id: cloudEst.id,
                    estimateNumber: cloudEst.estimate_number || "Draft",
                    clientName: cloudEst.clients?.name || "Unknown",
                    clientAddress: cloudEst.clients?.address || "",
                    taxRate: cloudEst.tax_rate ?? 13,
                    taxAmount: cloudEst.tax_amount ?? 0,
                    totalAmount: cloudEst.total_amount ?? 0,
                    summary_note: cloudEst.ai_summary || "",
                    createdAt: cloudEst.created_at,
                    sentAt: cloudEst.sent_at || undefined,
                    synced: true,
                    status: cloudEst.status === 'paid'
                        ? 'paid'
                        : (cloudEst.status === 'sent' ? 'sent' : 'draft'),
                    items: (cloudEst.estimate_items || []).map((item: any) => ({
                        id: item.id || crypto.randomUUID(),
                        itemNumber: 0, // Default
                        category: 'OTHER', // Default
                        unit: 'ea', // Default
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total: item.total,
                        is_value_add: false
                    })),
                    sections: Array.isArray(cloudEst.estimate_sections) && cloudEst.estimate_sections.length > 0
                        ? cloudEst.estimate_sections
                            .slice()
                            .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                            .map((section: any) => ({
                                id: section.local_id || section.id || crypto.randomUUID(),
                                divisionCode: section.division_code ?? undefined,
                                name: section.name || "Section",
                                items: (section.estimate_section_items || []).map((item: any) => ({
                                    id: item.local_id || crypto.randomUUID(),
                                    itemNumber: item.item_number ?? 0,
                                    category: item.category ?? 'OTHER',
                                    unit: item.unit ?? 'ea',
                                    description: item.description || "",
                                    quantity: item.quantity ?? 1,
                                    unit_price: item.unit_price ?? 0,
                                    total: item.total ?? ((item.quantity ?? 1) * (item.unit_price ?? 0)),
                                    is_value_add: false
                                }))
                            }))
                        : undefined,
                    attachments: Array.isArray(cloudEst.estimate_attachments) && cloudEst.estimate_attachments.length > 0
                        ? (() => {
                            const row = cloudEst.estimate_attachments[0]
                            const photos = Array.isArray(row?.photos) ? row.photos : []
                            const originalTranscript = row?.original_transcript ?? undefined
                            const audioUrl = row?.audio_url ?? undefined
                            const hasAny = photos.length > 0 || Boolean(originalTranscript) || Boolean(audioUrl)
                            return hasAny
                                ? { photos, originalTranscript, audioUrl }
                                : undefined
                        })()
                        : undefined
                }

                // Save to local (Overwrite existing)
                await saveEstimate(localEst)
            }
        }

        toast("Sync complete", "success")

    } catch (err) {
        console.error("Sync failed:", err)
        toast("Sync failed", "error")
    }
}
