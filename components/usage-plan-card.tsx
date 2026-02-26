"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Gauge, Sparkles } from "lucide-react"
import { withAuthHeaders } from "@/lib/auth-headers"

interface UsageSnapshot {
    planTier: "free" | "pro"
    periodStart: string
    usage: {
        generate: number
        transcribe: number
        send_email: number
    }
    limits: {
        generate: number
        transcribe: number
        send_email: number
    }
    remaining: {
        generate: number
        transcribe: number
        send_email: number
    }
    usageRatePct: {
        generate: number
        transcribe: number
        send_email: number
    }
    estimatedCosts: {
        openai: number
        resend: number
        total: number
    }
}

function ProgressBar({ value }: { value: number }) {
    const clamped = Math.min(100, Math.max(0, value))
    const color = clamped >= 100 ? "bg-red-500" : clamped >= 80 ? "bg-amber-500" : "bg-emerald-500"

    return (
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
        </div>
    )
}

export function UsagePlanCard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
    const [isAuthed, setIsAuthed] = useState(true)

    const loadSnapshot = useCallback(async () => {
        setLoading(true)
        try {
            const headers = await withAuthHeaders()
            const accessToken = headers.authorization

            if (!accessToken) {
                setIsAuthed(false)
                setSnapshot(null)
                return
            }

            const response = await fetch("/api/billing/usage", {
                method: "GET",
                headers,
            })

            if (response.status === 401) {
                setIsAuthed(false)
                setSnapshot(null)
                return
            }

            if (!response.ok) {
                setSnapshot(null)
                return
            }

            const data = (await response.json()) as UsageSnapshot
            setSnapshot(data)
            setIsAuthed(true)
        } catch (error) {
            console.error("Failed to load usage snapshot:", error)
            setSnapshot(null)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadSnapshot()
    }, [loadSnapshot])

    if (!isAuthed) return null

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Gauge className="h-4 w-4" />
                        Plan & Usage
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={loadSnapshot}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading && !snapshot ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading usage...
                    </div>
                ) : snapshot ? (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Current Plan</span>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold uppercase">{snapshot.planTier}</span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-xs"
                                    onClick={() => router.push("/pricing")}
                                >
                                    Upgrade
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span>AI Generate</span>
                                    <span>{snapshot.usage.generate}/{snapshot.limits.generate}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.generate} />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span>Voice Transcribe</span>
                                    <span>{snapshot.usage.transcribe}/{snapshot.limits.transcribe}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.transcribe} />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span>Email Sends</span>
                                    <span>{snapshot.usage.send_email}/{snapshot.limits.send_email}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.send_email} />
                            </div>
                        </div>

                        <div className="pt-2 border-t space-y-1">
                            <p className="text-xs text-muted-foreground">Estimated usage cost (month-to-date)</p>
                            <p className="text-sm">OpenAI: ${snapshot.estimatedCosts.openai.toFixed(4)}</p>
                            <p className="text-sm">Resend: ${snapshot.estimatedCosts.resend.toFixed(4)}</p>
                            <p className="font-semibold">Total: ${snapshot.estimatedCosts.total.toFixed(4)}</p>
                        </div>

                        {snapshot.planTier === "free" &&
                            (snapshot.usageRatePct.generate >= 80 ||
                                snapshot.usageRatePct.transcribe >= 80 ||
                                snapshot.usageRatePct.send_email >= 80) && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                                    <Sparkles className="h-3.5 w-3.5 mt-0.5" />
                                    <div className="flex-1">
                                        <p>Free quota is almost used. Upgrade flow will be connected next.</p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="mt-2 h-8 text-xs"
                                            onClick={() => router.push("/pricing")}
                                        >
                                            See Pro options
                                        </Button>
                                    </div>
                                </div>
                            )}
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">Usage data is not available yet.</p>
                )}
            </CardContent>
        </Card>
    )
}
