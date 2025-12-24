"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Download, X, Share } from "lucide-react"
import { usePWAInstall } from "@/hooks/usePWAInstall"

export function InstallPrompt() {
    const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall()
    const [dismissed, setDismissed] = useState(false)
    const [showIOSGuide, setShowIOSGuide] = useState(false)

    useEffect(() => {
        // Check if user dismissed previously
        const wasDismissed = localStorage.getItem("snapquote_install_dismissed")
        if (wasDismissed) {
            const dismissedAt = parseInt(wasDismissed)
            // Show again after 7 days
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

    const handleIOSClick = () => {
        setShowIOSGuide(true)
    }

    // Don't show if already installed or dismissed
    if (isInstalled || dismissed) return null

    // Don't show if not installable (not Android/Chrome) and not iOS
    if (!isInstallable && !isIOS) return null

    return (
        <>
            {/* Install Banner */}
            <div className="fixed top-0 left-0 right-0 z-40 p-2 bg-primary/95 backdrop-blur-sm">
                <div className="flex items-center justify-between max-w-md mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg">
                            <Download className="h-4 w-4 text-white" />
                        </div>
                        <div className="text-white">
                            <p className="text-sm font-medium">Install SnapQuote</p>
                            <p className="text-xs opacity-80">Use it like a native app</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isIOS ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleIOSClick}
                                className="h-8"
                            >
                                How to Install
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={handleInstall}
                                className="h-8"
                            >
                                Install
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleDismiss}
                            className="h-8 w-8 text-white hover:bg-white/20"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* iOS Installation Guide Modal */}
            {showIOSGuide && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-sm">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-lg">Install on iPhone/iPad</h3>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setShowIOSGuide(false)}
                                    className="h-8 w-8"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                                        1
                                    </div>
                                    <div>
                                        <p className="text-sm">
                                            Tap the <Share className="h-4 w-4 inline text-primary" /> Share button in Safari
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                                        2
                                    </div>
                                    <div>
                                        <p className="text-sm">
                                            Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
                                        3
                                    </div>
                                    <div>
                                        <p className="text-sm">
                                            Tap <strong>&quot;Add&quot;</strong> to confirm
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                className="w-full mt-6"
                                onClick={() => setShowIOSGuide(false)}
                            >
                                Got it!
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            )}
        </>
    )
}
