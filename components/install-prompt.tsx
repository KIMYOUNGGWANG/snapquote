"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Share, X } from "lucide-react"
import { usePWAInstall } from "@/hooks/usePWAInstall"

export function InstallPrompt() {
    const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()
    const [dismissed, setDismissed] = useState(false)
    const [showIOSGuide, setShowIOSGuide] = useState(false)

    useEffect(() => {
        const wasDismissed = localStorage.getItem("snapquote_install_dismissed")
        if (wasDismissed) {
            const dismissedAt = parseInt(wasDismissed)
            if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
                setDismissed(true)
            }
        }
    }, [])

    const handleDismiss = () => {
        localStorage.setItem("snapquote_install_dismissed", Date.now().toString())
        setDismissed(true)
    }

    const handleInstall = async () => {
        const installed = await promptInstall()
        if (installed) {
            setDismissed(true)
        }
    }

    if (isInstalled || dismissed) return null
    if (!isInstallable && !isIOS) return null

    return (
        <>
            <div
                className="fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md"
                role="region"
                aria-label="Install SnapQuote"
            >
                <div className="field-panel flex items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200">
                            <Download className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">Install SnapQuote</p>
                            <p className="truncate text-xs text-slate-400">Faster access from the jobsite.</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {isIOS ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowIOSGuide(true)}
                                className="rounded-lg border-white/10 bg-slate-950/70 px-3 text-xs text-white hover:bg-slate-900"
                            >
                                How
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={handleInstall}
                                className="rounded-lg bg-blue-600 px-3 text-xs text-white hover:bg-blue-500"
                            >
                                Install
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleDismiss}
                            aria-label="Dismiss install prompt"
                            className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {showIOSGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="field-panel w-full max-w-sm overflow-hidden">
                        <div className="border-b border-white/10 px-5 py-4">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-base font-semibold text-white">Install on iPhone/iPad</h3>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setShowIOSGuide(false)}
                                    aria-label="Close install instructions"
                                    className="rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4 p-5">
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-200">
                                        1
                                    </div>
                                    <p className="text-sm text-slate-200">
                                        Tap the <Share className="inline h-4 w-4 text-blue-200" /> Share button in Safari.
                                    </p>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-200">
                                        2
                                    </div>
                                    <p className="text-sm text-slate-200">
                                        Scroll down and tap <strong className="text-white">&quot;Add to Home Screen&quot;</strong>.
                                    </p>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-xs font-bold text-blue-200">
                                        3
                                    </div>
                                    <p className="text-sm text-slate-200">
                                        Tap <strong className="text-white">&quot;Add&quot;</strong> to confirm.
                                    </p>
                                </div>
                            </div>

                            <Button
                                className="w-full rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                                onClick={() => setShowIOSGuide(false)}
                            >
                                Got it!
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
