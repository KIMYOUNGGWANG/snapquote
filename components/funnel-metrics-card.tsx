"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, TrendingUp } from "lucide-react"

interface FunnelMetrics {
    draft_saved: number
    quote_sent: number
    payment_link_created: number
    payment_completed: number
    send_rate: number
    payment_rate: number
}

export function FunnelMetricsCard() {
    const [loading, setLoading] = useState(true)
    const [metrics, setMetrics] = useState<FunnelMetrics | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                const accessToken = session?.access_token

                if (!accessToken) {
                    setLoading(false)
                    return
                }

                const response = await fetch("/api/analytics/funnel", {
                    headers: {
                        authorization: `Bearer ${accessToken}`,
                    },
                })

                if (!response.ok) {
                    setLoading(false)
                    return
                }

                const data = await response.json()
                setMetrics({
                    draft_saved: data.draft_saved || 0,
                    quote_sent: data.quote_sent || 0,
                    payment_link_created: data.payment_link_created || 0,
                    payment_completed: data.payment_completed || 0,
                    send_rate: data.send_rate || 0,
                    payment_rate: data.payment_rate || 0,
                })
            } catch (error) {
                console.error("Failed to load funnel metrics:", error)
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    if (loading) {
        return (
            <div className="field-card flex items-center justify-center p-6 text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-300" />
                Loading conversion metrics...
            </div>
        )
    }

    if (!metrics) {
        return (
            <div className="field-card p-6 text-sm text-slate-400">
                Sign in to view conversion funnel metrics.
            </div>
        )
    }

    return (
        <div className="field-card">
            <div className="border-b border-white/10 p-4 pb-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                    <TrendingUp className="h-4 w-4 text-blue-200" />
                    Conversion Funnel (30d)
                </h2>
            </div>
            <div className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Send Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.send_rate}%</p>
                        <p className="text-xs text-slate-400">{metrics.quote_sent}/{metrics.draft_saved}</p>
                    </div>
                    <div className="field-mini p-3">
                        <p className="text-xs text-slate-400">Payment Rate</p>
                        <p className="text-xl font-bold text-white">{metrics.payment_rate}%</p>
                        <p className="text-xs text-slate-400">{metrics.payment_completed}/{metrics.quote_sent}</p>
                    </div>
                </div>
                <p className="text-xs text-slate-400">
                    Payment links created: {metrics.payment_link_created}
                </p>
            </div>
        </div>
    )
}
