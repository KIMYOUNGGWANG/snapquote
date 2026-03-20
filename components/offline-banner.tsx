"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"
import { formatPendingSyncSummary, getPendingSyncSummary, type PendingSyncSummary } from "@/lib/offline-sync"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"

export function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false)
    const [showBanner, setShowBanner] = useState(false)
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

        // Initial check
        setIsOffline(!navigator.onLine)
        setShowBanner(!navigator.onLine)
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

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            unsubscribe()
        }
    }, [])

    if (!showBanner) return null

    return (
        <div
            className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium transition-all duration-300 ${isOffline
                    ? "bg-amber-500 text-amber-950"
                    : "bg-green-500 text-green-950"
                }`}
        >
            {isOffline ? (
                <div className="flex items-center justify-center gap-2">
                    <WifiOff className="h-4 w-4" />
                    <span>
                        📴 You&apos;re offline. {summary.totalPendingCount > 0
                            ? `${formatPendingSyncSummary(summary)} saved on this device.`
                            : "Any new changes will stay on this device until you reconnect."}
                    </span>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2">
                    <Wifi className="h-4 w-4" />
                    <span>
                        ✅ Back online! {summary.totalPendingCount > 0
                            ? `Syncing ${formatPendingSyncSummary(summary)}.`
                            : "Local changes are ready to sync."}
                    </span>
                </div>
            )}
        </div>
    )
}
