import { supabase } from './supabase'
import { getEstimatesFromDB, saveEstimateToDB } from './db'

export async function syncEstimates() {
    if (!navigator.onLine) return

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        // Not logged in, skip sync
        return
    }

    const estimates = await getEstimatesFromDB()
    const unsynced = estimates.filter(est => !est.synced)

    if (unsynced.length === 0) return

    for (const estimate of unsynced) {
        try {
            const { error } = await supabase
                .from('estimates')
                .upsert({
                    id: estimate.id,
                    estimate_number: estimate.estimateNumber,
                    client_name: estimate.clientName,
                    client_address: estimate.clientAddress,
                    total_amount: estimate.totalAmount,
                    items: estimate.items,
                    summary_note: estimate.summary_note,
                    created_at: estimate.createdAt,
                    user_id: (await supabase.auth.getUser()).data.user?.id
                })

            if (!error) {
                await saveEstimateToDB({ ...estimate, synced: true })
            } else {
                console.error("Sync error for estimate", estimate.id, error)
            }
        } catch (err) {
            console.error("Sync exception", err)
        }
    }
}
