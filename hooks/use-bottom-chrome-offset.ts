"use client"

import { useEffect, useState } from "react"

const FALLBACK_BOTTOM_NAV_HEIGHT = 92

export function useBottomChromeOffset({
    gap = 12,
    includeOfflineBanner = false,
}: {
    gap?: number
    includeOfflineBanner?: boolean
} = {}) {
    const [offset, setOffset] = useState(FALLBACK_BOTTOM_NAV_HEIGHT + gap)

    useEffect(() => {
        let frame = 0

        const measure = () => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(() => {
                const bottomNav = document.querySelector<HTMLElement>('[data-testid="bottom-navigation"]')
                const bottomNavRect = bottomNav?.getBoundingClientRect()
                const bottomNavHeight = bottomNavRect
                    ? Math.max(0, window.innerHeight - bottomNavRect.top)
                    : FALLBACK_BOTTOM_NAV_HEIGHT
                const offlineBanner = includeOfflineBanner
                    ? document.querySelector<HTMLElement>('[data-testid="offline-status-banner"]')
                    : null
                const offlineBannerHeight = offlineBanner?.getBoundingClientRect().height ?? 0
                const nextOffset = Math.ceil(bottomNavHeight + gap + (offlineBanner ? offlineBannerHeight + gap : 0))

                setOffset((currentOffset) => currentOffset === nextOffset ? currentOffset : nextOffset)
            })
        }

        measure()

        const mutationObserver = new MutationObserver(measure)
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
        })
        mutationObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-snapquote-offline-banner"],
        })

        const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
        const bottomNav = document.querySelector<HTMLElement>('[data-testid="bottom-navigation"]')
        if (bottomNav) resizeObserver?.observe(bottomNav)

        window.addEventListener("resize", measure)

        return () => {
            window.cancelAnimationFrame(frame)
            mutationObserver.disconnect()
            resizeObserver?.disconnect()
            window.removeEventListener("resize", measure)
        }
    }, [gap, includeOfflineBanner])

    return offset
}
