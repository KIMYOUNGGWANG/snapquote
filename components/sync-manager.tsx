"use client"

import { useEffect, useState } from "react"
import { syncEstimates } from "@/lib/sync"
import { toast } from "@/components/toast"
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export function SyncManager() {
    const [status, setStatus] = useState<SyncState>('idle')
    const [lastSync, setLastSync] = useState<Date | null>(null)

    const performSync = async () => {
        if (!navigator.onLine) {
            setStatus('offline')
            return
        }

        setStatus('syncing')
        try {
            await syncEstimates()
            setStatus('synced')
            setLastSync(new Date())

            // Revert to idle after 3 seconds
            setTimeout(() => setStatus('idle'), 3000)
        } catch (error) {
            console.error("Sync failed:", error)
            setStatus('error')
            toast("Sync failed. Tap to retry.", "error")
        }
    }

    useEffect(() => {
        const handleOnline = () => {
            toast("🔄 Back online! Syncing...", "info")
            performSync()
        }
        const handleOffline = () => setStatus('offline')

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Check initial state
        if (!navigator.onLine) setStatus('offline')
        else performSync()

        // Background sync
        const interval = setInterval(() => {
            if (navigator.onLine) performSync()
        }, 5 * 60 * 1000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            clearInterval(interval)
        }
    }, [])

    if (status === 'idle' && !lastSync) return null // Don't show anything if never synced and idle

    return (
        <button
            onClick={performSync}
            className={cn(
                "fixed top-4 right-4 z-40 bg-background/80 backdrop-blur border rounded-full px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs font-medium transition-all",
                status === 'error' && "bg-red-50 text-red-600 border-red-200",
                status === 'offline' && "bg-slate-100 text-slate-500",
            )}
        >
            {status === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin" />}
            {status === 'synced' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            {status === 'error' && <RefreshCw className="h-3 w-3" />}
            {status === 'offline' && <CloudOff className="h-3 w-3" />}
            {(status === 'idle' && lastSync) && <Cloud className="h-3 w-3 text-blue-500" />}

            <span>
                {status === 'syncing' && "Syncing..."}
                {status === 'synced' && "Synced"}
                {status === 'error' && "Retry"}
                {status === 'offline' && "Offline"}
                {status === 'idle' && "Saved"}
            </span>
        </button>
    )
}
