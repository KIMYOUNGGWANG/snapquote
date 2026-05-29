"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, Gauge, Sparkles } from "lucide-react"
import { getBillingUsageSnapshot, type BillingUsageSnapshot } from "@/lib/billing-usage"
import { FREE_PLAN_MARKETING_QUOTE_LIMIT } from "@/lib/free-tier"

function ProgressBar({ value }: { value: number }) {
    const clamped = Math.min(100, Math.max(0, value))
    const color = clamped >= 100 ? "bg-red-500" : clamped >= 80 ? "bg-amber-500" : "bg-emerald-500"

    return (
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div className={`h-full transition-all ${color}`} style={{ width: `${clamped}%` }} />
        </div>
    )
}

export function UsagePlanCard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState<BillingUsageSnapshot | null>(null)
    const [isAuthed, setIsAuthed] = useState(true)

    const loadSnapshot = useCallback(async () => {
        setLoading(true)
        try {
            const result = await getBillingUsageSnapshot()
            setIsAuthed(result.authorized)
            setSnapshot(result.snapshot)
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
        <div className="field-card">
            <div className="border-b border-white/10 p-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                        <Gauge className="h-4 w-4 text-blue-200" />
                        Plan & Usage
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="min-w-11 rounded-lg px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                        onClick={loadSnapshot}
                        disabled={loading}
                        aria-label="Refresh usage"
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                    </Button>
                </div>
            </div>
            <div className="space-y-4 p-4">
                {loading && !snapshot ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                        Loading usage...
                    </div>
                ) : snapshot ? (
                    <>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-400">Current Plan</span>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold uppercase text-white">{snapshot.planTier}</span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg border-white/10 bg-slate-950/70 px-3 text-xs text-white hover:bg-slate-900"
                                    onClick={() => router.push("/pricing")}
                                >
                                    Upgrade
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs text-slate-300">
                                    <span>AI Generate</span>
                                    <span>{snapshot.usage.generate}/{snapshot.limits.generate}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.generate} />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs text-slate-300">
                                    <span>Voice Transcribe</span>
                                    <span>{snapshot.usage.transcribe}/{snapshot.limits.transcribe}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.transcribe} />
                            </div>
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs text-slate-300">
                                    <span>Email Sends</span>
                                    <span>{snapshot.usage.send_email}/{snapshot.limits.send_email}</span>
                                </div>
                                <ProgressBar value={snapshot.usageRatePct.send_email} />
                            </div>
                        </div>

                        <div className="space-y-1 border-t border-white/10 pt-3">
                            <p className="text-xs text-slate-400">Estimated usage cost (month-to-date)</p>
                            <p className="text-sm text-slate-300">OpenAI: ${snapshot.estimatedCosts.openai.toFixed(4)}</p>
                            <p className="text-sm text-slate-300">Resend: ${snapshot.estimatedCosts.resend.toFixed(4)}</p>
                            <p className="font-semibold text-white">Total: ${snapshot.estimatedCosts.total.toFixed(4)}</p>
                        </div>

                        {snapshot.planTier === "free" &&
                            (snapshot.usageRatePct.generate >= 80 ||
                                snapshot.usageRatePct.transcribe >= 80 ||
                                snapshot.usageRatePct.send_email >= 80) && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                                    <Sparkles className="mt-0.5 h-3.5 w-3.5" />
                                    <div className="flex-1">
                                        <p>Free quota is almost used. Upgrade before you hit the {FREE_PLAN_MARKETING_QUOTE_LIMIT}-quote monthly cap.</p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="mt-2 rounded-lg bg-amber-500 text-xs text-slate-950 hover:bg-amber-400"
                                            onClick={() => router.push("/pricing")}
                                        >
                                            See Pro options
                                        </Button>
                                    </div>
                                </div>
                            )}
                    </>
                ) : (
                    <p className="text-sm text-slate-400">Usage data is not available yet.</p>
                )}
            </div>
        </div>
    )
}
