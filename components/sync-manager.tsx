"use client"

import { useEffect } from "react"
import { syncEstimates } from "@/lib/sync"
import { toast } from "@/components/toast"

export function SyncManager() {
    useEffect(() => {
        const handleOnline = () => {
            toast("You are back online. Syncing...", "info")
            syncEstimates()
        }

        window.addEventListener('online', handleOnline)

        // Initial sync attempt
        if (navigator.onLine) {
            syncEstimates()
        }

        return () => {
            window.removeEventListener('online', handleOnline)
        }
    }, [])

    return null
}
