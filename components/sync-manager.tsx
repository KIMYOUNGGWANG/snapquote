"use client"

import { useEffect } from "react"
import { syncEstimates } from "@/lib/sync"
import { toast } from "@/components/toast"

export function SyncManager() {
    useEffect(() => {
        const handleOnline = async () => {
            toast("🔄 Back online! Syncing data...", "info")
            try {
                await syncEstimates()
                // Success toast is handled in sync.ts if needed
            } catch (error) {
                console.error("Sync failed:", error)
                toast("⚠️ Sync failed. Will retry later.", "error")
            }
        }

        window.addEventListener('online', handleOnline)

        // Initial sync attempt on mount
        if (navigator.onLine) {
            syncEstimates().catch(err => {
                console.error("Initial sync failed:", err)
            })
        }

        // Periodic background sync every 5 minutes (if online)
        const syncInterval = setInterval(() => {
            if (navigator.onLine) {
                syncEstimates().catch(err => {
                    console.error("Background sync failed:", err)
                })
            }
        }, 5 * 60 * 1000) // 5 minutes

        return () => {
            window.removeEventListener('online', handleOnline)
            clearInterval(syncInterval)
        }
    }, [])

    return null
}
