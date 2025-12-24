"use client"

import { useState, useEffect } from "react"

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export function usePWAInstall() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
    const [isInstallable, setIsInstallable] = useState(false)
    const [isInstalled, setIsInstalled] = useState(false)
    const [isIOS, setIsIOS] = useState(false)

    useEffect(() => {
        // Check if already installed (standalone mode)
        if (window.matchMedia("(display-mode: standalone)").matches) {
            setIsInstalled(true)
            return
        }

        // Check if on iOS
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
        setIsIOS(isIOSDevice)

        // Listen for beforeinstallprompt (Android/Chrome)
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e as BeforeInstallPromptEvent)
            setIsInstallable(true)
        }

        window.addEventListener("beforeinstallprompt", handleBeforeInstall)

        // Listen for successful install
        window.addEventListener("appinstalled", () => {
            setIsInstalled(true)
            setIsInstallable(false)
            setDeferredPrompt(null)
        })

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
        }
    }, [])

    const promptInstall = async () => {
        if (!deferredPrompt) return false

        deferredPrompt.prompt()
        const { outcome } = await deferredPrompt.userChoice

        if (outcome === "accepted") {
            setIsInstalled(true)
            setIsInstallable(false)
        }

        setDeferredPrompt(null)
        return outcome === "accepted"
    }

    return {
        isInstallable,
        isInstalled,
        isIOS,
        promptInstall,
    }
}
