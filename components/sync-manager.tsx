"use client"

import { useCallback, useEffect, useState } from "react"
import { syncEstimates } from "@/lib/sync"
import { toast } from "@/components/toast"
import { Cloud, RefreshCw, CheckCircle2, LogIn } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatPendingSyncSummary, getPendingSyncSummary, type PendingSyncSummary } from "@/lib/offline-sync"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"
import { usePathname } from "next/navigation"

type SyncState = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'auth_required'
type SyncSource = 'automatic' | 'manual'

export function SyncManager() {
    const pathname = usePathname()
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

    const performSync = useCallback(async (source: SyncSource = 'automatic') => {
        if (!navigator.onLine) {
            setStatus('offline')
            return
        }

        setStatus('syncing')
        try {
            const result = await syncEstimates()
            if (result.status === 'offline') {
                setStatus('offline')
                await loadSummary()
                return
            }

            if (result.status === 'unauthenticated') {
                setStatus('auth_required')
                await loadSummary()
                return
            }

            setStatus('synced')
            setLastSync(new Date())
            await loadSummary()

            // Revert to idle after 3 seconds
            setTimeout(() => setStatus('idle'), 3000)
        } catch (error) {
            console.error("Sync failed:", error)
            setStatus('error')
            if (source === 'manual') {
                toast("Sync failed. Changes are still saved locally.", "error")
            }
            await loadSummary()
        }
    }, [loadSummary])

    const handleSyncClick = useCallback(() => {
        if (status === 'auth_required') {
            const params = new URLSearchParams({ next: pathname || "/" })
            window.location.href = `/login?${params.toString()}`
            return
        }

        void performSync('manual')
    }, [pathname, performSync, status])

    useEffect(() => {
        const handleOnline = async () => {
            let nextSummary: PendingSyncSummary | null = null
            try {
                nextSummary = await getPendingSyncSummary()
                setSummary(nextSummary)
            } catch (error) {
                console.error("Failed to load offline queue summary:", error)
            }

            if (nextSummary && nextSummary.totalPendingCount > 0) {
                toast(`Back online. Syncing ${formatPendingSyncSummary(nextSummary)}.`, "info")
            }

            void performSync()
        }
        const handleOnlineEvent = () => void handleOnline()
        const handleOffline = () => {
            setStatus('offline')
            void loadSummary()
        }

        window.addEventListener('online', handleOnlineEvent)
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
            window.removeEventListener('online', handleOnlineEvent)
            window.removeEventListener('offline', handleOffline)
            unsubscribe()
            clearInterval(interval)
        }
    }, [loadSummary, performSync])

    const hasInlineSyncStatus = pathname === "/drafts" ||
        pathname?.startsWith("/history") ||
        pathname?.startsWith("/new-estimate")
    const shouldHideSyncPill = pathname?.startsWith("/login") ||
        pathname?.startsWith("/auth/callback") ||
        pathname?.startsWith("/landing") ||
        pathname?.startsWith("/pricing") ||
        pathname?.startsWith("/payment-success") ||
        pathname?.startsWith("/privacy") ||
        pathname?.startsWith("/terms") ||
        ((pathname === "/" || hasInlineSyncStatus) && status === 'auth_required')

    const hasPendingWork = summary.totalPendingCount > 0
    const shouldShowSyncPill = status === 'error' || (status !== 'offline' && hasPendingWork)

    if (shouldHideSyncPill || !shouldShowSyncPill) return null

    return (
        <div className="pointer-events-none fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-0 right-0 z-[90] flex justify-center">
            <div className="flex w-full max-w-md justify-end px-4 md:max-w-2xl">
                <button
                    onClick={handleSyncClick}
                    title={formatPendingSyncSummary(summary)}
                    data-testid="sync-status-button"
                    className={cn(
                        "pointer-events-auto flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-300 shadow-[0_16px_40px_-26px_rgba(0,0,0,0.9)] transition-all",
                        status === 'error' && "border-red-400/25 bg-red-950 text-red-200",
                        status === 'auth_required' && "border-sky-400/25 bg-sky-950 text-sky-100",
                        summary.totalPendingCount > 0 && status !== 'error' && status !== 'auth_required' && "border-amber-400/25 bg-amber-950 text-amber-100",
                    )}
                >
                    {status === 'syncing' && <RefreshCw className="h-3 w-3 animate-spin" />}
                    {status === 'synced' && <CheckCircle2 className="h-3 w-3 text-emerald-300" />}
                    {status === 'error' && <RefreshCw className="h-3 w-3" />}
                    {status === 'auth_required' && <LogIn className="h-3 w-3 text-sky-300" />}
                    {(status === 'idle' && lastSync) && <Cloud className="h-3 w-3 text-blue-300" />}

                    <span>
                        {status === 'syncing' && `Syncing${summary.totalPendingCount > 0 ? ` ${summary.totalPendingCount}` : "..."}`}
                        {status === 'synced' && "Synced"}
                        {status === 'error' && (summary.totalPendingCount > 0 ? `Retry ${summary.totalPendingCount}` : "Retry")}
                        {status === 'auth_required' && "Sign in to sync"}
                        {status === 'idle' && (summary.totalPendingCount > 0 ? `${summary.totalPendingCount} queued` : "Saved")}
                    </span>
                </button>
            </div>
        </div>
    )
}
