"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { formatPendingSyncSummary, getPendingSyncSummary, type PendingSyncSummary } from "@/lib/offline-sync"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"
import { useBottomChromeOffset } from "@/hooks/use-bottom-chrome-offset"

export function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false)
    const [showBanner, setShowBanner] = useState(false)
    const bottomOffset = useBottomChromeOffset()
    const [summary, setSummary] = useState<PendingSyncSummary>({
        draftCount: 0,
        sentCount: 0,
        paidCount: 0,
        unsyncedEstimateCount: 0,
        pendingAudioCount: 0,
        totalPendingCount: 0,
    })

    useEffect(() => {
        const loadSummary = async () => {
            try {
                setSummary(await getPendingSyncSummary())
            } catch (error) {
                console.error("Failed to load offline banner summary:", error)
            }
        }

        const syncConnectionState = () => {
            const nextIsOffline = !navigator.onLine
            setIsOffline(nextIsOffline)
            if (nextIsOffline) setShowBanner(true)
        }

        // Initial check
        syncConnectionState()
        void loadSummary()

        const handleOnline = () => {
            setIsOffline(false)
            void loadSummary()
            // Show "back online" briefly
            setShowBanner(true)
            setTimeout(() => setShowBanner(false), 3000)
        }

        const handleOffline = () => {
            setIsOffline(true)
            setShowBanner(true)
            void loadSummary()
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        const unsubscribe = subscribeOfflineQueueChanged(() => {
            void loadSummary()
        })
        const connectionCheckId = window.setInterval(syncConnectionState, 1000)
        document.documentElement.dataset.snapquoteOfflineMonitor = "ready"

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            unsubscribe()
            window.clearInterval(connectionCheckId)
            delete document.documentElement.dataset.snapquoteOfflineMonitor
        }
    }, [])

    useEffect(() => {
        if (showBanner) {
            document.documentElement.dataset.snapquoteOfflineBanner = "visible"
        } else {
            delete document.documentElement.dataset.snapquoteOfflineBanner
        }

        return () => {
            delete document.documentElement.dataset.snapquoteOfflineBanner
        }
    }, [showBanner])

    if (!showBanner) return null

    return (
        <div className="pointer-events-none fixed left-0 right-0 z-[95] flex justify-center px-4" style={{ bottom: bottomOffset }}>
            <div
                data-testid="offline-status-banner"
                className={`pointer-events-auto w-full max-w-md rounded-lg border px-3 py-2 text-center text-xs font-medium shadow-[0_18px_48px_-28px_rgba(0,0,0,0.95)] transition-all duration-300 md:max-w-2xl ${isOffline
                        ? "border-amber-400/25 bg-amber-950 text-amber-100"
                        : "border-emerald-400/25 bg-emerald-950 text-emerald-100"
                    }`}
            >
                {isOffline ? (
                    <div className="flex items-center justify-center gap-2">
                        <WifiOff className="h-4 w-4 shrink-0" />
                        <span>
                            You&apos;re offline. {summary.totalPendingCount > 0
                                ? `${formatPendingSyncSummary(summary)} saved on this device.`
                                : "New changes stay on this device until reconnect."}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-2">
                        <Wifi className="h-4 w-4 shrink-0" />
                        <span>
                            Back online. {summary.totalPendingCount > 0
                                ? `Syncing ${formatPendingSyncSummary(summary)}.`
                                : "No local changes are waiting."}
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
