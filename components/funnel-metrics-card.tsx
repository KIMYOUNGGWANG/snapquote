"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardContent className="p-6 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading conversion metrics...
                </CardContent>
            </Card>
        )
    }

    if (!metrics) {
        return (
            <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                    Sign in to view conversion funnel metrics.
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Conversion Funnel (30d)
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Send Rate</p>
                        <p className="text-xl font-bold">{metrics.send_rate}%</p>
                        <p className="text-xs text-muted-foreground">{metrics.quote_sent}/{metrics.draft_saved}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                        <p className="text-xs text-muted-foreground">Payment Rate</p>
                        <p className="text-xl font-bold">{metrics.payment_rate}%</p>
                        <p className="text-xs text-muted-foreground">{metrics.payment_completed}/{metrics.quote_sent}</p>
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Payment links created: {metrics.payment_link_created}
                </p>
            </CardContent>
        </Card>
    )
}
