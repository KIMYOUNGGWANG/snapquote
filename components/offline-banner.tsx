"use client"

import { useState, useEffect } from "react"
import { WifiOff, Wifi } from "lucide-react"

export function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false)
    const [showBanner, setShowBanner] = useState(false)

    useEffect(() => {
        // Initial check
        setIsOffline(!navigator.onLine)
        setShowBanner(!navigator.onLine)

        const handleOnline = () => {
            setIsOffline(false)
            // Show "back online" briefly
            setShowBanner(true)
            setTimeout(() => setShowBanner(false), 3000)
        }

        const handleOffline = () => {
            setIsOffline(true)
            setShowBanner(true)
        }

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
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
                    <span>📴 You&apos;re offline - Some features may be limited</span>
                </div>
            ) : (
                <div className="flex items-center justify-center gap-2">
                    <Wifi className="h-4 w-4" />
                    <span>✅ Back online!</span>
                </div>
            )}
        </div>
    )
}
