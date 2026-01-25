import { supabase } from './supabase'
import { getEstimates, saveEstimate, LocalEstimate } from './estimates-storage' // Correct imports
import { toast } from '@/components/toast' // Use existing toast component

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
            // A. Insert Estimate
            const { error: estError } = await supabase
                .from('estimates')
                .upsert({
                    id: estimate.id,
                    user_id: user.id,
                    estimate_number: estimate.estimateNumber,
                    client_name: estimate.clientName,
                    client_address: estimate.clientAddress,
                    total_amount: estimate.totalAmount,
                    tax_rate: estimate.taxRate,
                    tax_amount: estimate.taxAmount,
                    summary_note: estimate.summary_note,
                    created_at: estimate.createdAt,
                    status: 'draft', // Force status to valid DB enum
                    updated_at: new Date().toISOString()
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

            if (!itemError) {
                // Mark locally as synced
                await saveEstimate({ ...estimate, synced: true })
            } else {
                console.error("Sync push error (Items):", itemError)
            }
        }

        // ==========================================
        // PULL: Cloud -> Local
        // ==========================================
        const { data: cloudEstimates, error: pullError } = await supabase
            .from('estimates')
            .select(`
                *,
                estimate_items (*)
            `)
            .eq('user_id', user.id)

        if (pullError) throw pullError

        if (cloudEstimates) {
            for (const cloudEst of cloudEstimates) {
                // Convert DB shape to LocalEstimate shape
                const localEst: LocalEstimate = {
                    id: cloudEst.id,
                    estimateNumber: cloudEst.estimate_number || "Draft",
                    clientName: cloudEst.client_name || "Unknown",
                    clientAddress: cloudEst.client_address || "",
                    taxRate: cloudEst.tax_rate ?? 13,
                    taxAmount: cloudEst.tax_amount ?? 0,
                    totalAmount: cloudEst.total_amount ?? 0,
                    summary_note: cloudEst.summary_note || "",
                    createdAt: cloudEst.created_at,
                    synced: true,
                    status: 'draft', // Default for synced items
                    items: cloudEst.estimate_items.map((item: any) => ({
                        id: item.id || Math.random().toString(), // Ensure ID exists
                        itemNumber: 0, // Default
                        category: 'OTHER', // Default
                        unit: 'ea', // Default
                        description: item.description,
                        quantity: item.quantity,
                        unit_price: item.unit_price,
                        total: item.total,
                        is_value_add: false
                    }))
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
