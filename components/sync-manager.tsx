"use client"

import { useCallback, useEffect, useState } from "react"
import { syncEstimates } from "@/lib/sync"
import { toast } from "@/components/toast"
import { Cloud, CloudOff, RefreshCw, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPendingSyncSummary, getPendingSyncSummary, type PendingSyncSummary } from "@/lib/offline-sync"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"

type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

export function SyncManager() {
    const [status, setStatus] = useState<SyncState>('idle')
    const [lastSync, setLastSync] = useState<Date | null>(null)
    const [summary, setSummary] = useState<PendingSyncSummary>({
        draftCount: 0,
        sentCount: 0,
        paidCount: 0,
        unsyncedEstimateCount: 0,
        pendingAudioCount: 0,
        totalPendingCount: 0,
    })

    const loadSummary = useCallback(async () => {
        try {
            setSummary(await getPendingSyncSummary())
        } catch (error) {
            console.error("Failed to load offline queue summary:", error)
        }
    }, [])

    const performSync = useCallback(async () => {
        if (!navigator.onLine) {
            setStatus('offline')
            return
        }

        setStatus('syncing')
        try {
            await syncEstimates()
            setStatus('synced')
            setLastSync(new Date())
            await loadSummary()

            // Revert to idle after 3 seconds
            setTimeout(() => setStatus('idle'), 3000)
        } catch (error) {
            console.error("Sync failed:", error)
            setStatus('error')
            toast("Sync failed. Tap to retry.", "error")
            await loadSummary()
        }
    }, [loadSummary])

    useEffect(() => {
        const handleOnline = () => {
            toast("🔄 Back online! Syncing...", "info")
            void loadSummary()
            void performSync()
        }
        const handleOffline = () => {
            setStatus('offline')
            void loadSummary()
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        const unsubscribe = subscribeOfflineQueueChanged(() => {
            void loadSummary()
        })

        // Check initial state
        if (!navigator.onLine) {
            setStatus('offline')
            void loadSummary()
        } else {
            void loadSummary()
            void performSync()
        }

        // Background sync
        const interval = setInterval(() => {
            if (navigator.onLine) void performSync()
            else void loadSummary()
        }, 5 * 60 * 1000)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            unsubscribe()
            clearInterval(interval)
        }
    }, [loadSummary, performSync])

    if (status === 'idle' && !lastSync && summary.totalPendingCount === 0) return null

    return (
        <button
            onClick={performSync}
            title={formatPendingSyncSummary(summary)}
            className={cn(
                "fixed top-4 right-4 z-40 bg-background/80 backdrop-blur border rounded-full px-3 py-1.5 shadow-sm flex items-center gap-2 text-xs font-medium transition-all",
                status === 'error' && "bg-red-50 text-red-600 border-red-200",
                status === 'offline' && "bg-slate-100 text-slate-500",
                summary.totalPendingCount > 0 && status !== 'offline' && status !== 'error' && "border-amber-300 bg-amber-50/90 text-amber-900",
            )}
        >
            {status === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin" />}
            {status === 'synced' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            {status === 'error' && <RefreshCw className="h-3 w-3" />}
            {status === 'offline' && <CloudOff className="h-3 w-3" />}
            {(status === 'idle' && lastSync) && <Cloud className="h-3 w-3 text-blue-500" />}

            <span>
                {status === 'syncing' && `Syncing${summary.totalPendingCount > 0 ? ` ${summary.totalPendingCount}` : "..."}`}
                {status === 'synced' && "Synced"}
                {status === 'error' && (summary.totalPendingCount > 0 ? `Retry ${summary.totalPendingCount}` : "Retry")}
                {status === 'offline' && (summary.totalPendingCount > 0 ? `Offline ${summary.totalPendingCount}` : "Offline")}
                {status === 'idle' && (summary.totalPendingCount > 0 ? `${summary.totalPendingCount} queued` : "Saved")}
            </span>
        </button>
    )
}
