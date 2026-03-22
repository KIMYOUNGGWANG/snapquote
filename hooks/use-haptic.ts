"use client"

import { useCallback } from "react"

export function useHaptic() {
    const vibrate = useCallback((pattern: number | number[]) => {
        if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.vibrate) {
            try {
                navigator.vibrate(pattern)
            } catch (error) {
                // Ignore gracefully on unsupported devices (e.g. iOS Safari)
            }
        }
    }, [])

    return {
        light: () => vibrate(50),
        medium: () => vibrate(100),
        heavy: () => vibrate(200),
        success: () => vibrate([50, 50, 100]),
        error: () => vibrate([50, 50, 50, 50, 100]),
    }
}
