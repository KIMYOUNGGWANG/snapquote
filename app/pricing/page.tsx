"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles, ArrowRight } from "lucide-react"
import { getPricingOffer, trackPricingEvent, type PricingOfferResponse } from "@/lib/pricing"
import { toast } from "@/components/toast"

export default function PricingPage() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [offer, setOffer] = useState<PricingOfferResponse | null>(null)

    useEffect(() => {
        let cancelled = false

        const load = async () => {
            setLoading(true)
            const data = await getPricingOffer()
            if (cancelled) return
            setOffer(data)
            setLoading(false)
        }

        void load()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10)
        const key = `snapquote_pricing_viewed:${today}`
        if (sessionStorage.getItem(key)) return
        sessionStorage.setItem(key, "1")

        void trackPricingEvent({
            event: "pricing_viewed",
            metadata: { path: "/pricing" },
        })
    }, [])

    const variant = offer?.ok && offer.variant ? offer.variant : null
    const currency = offer?.ok && offer.experiment ? offer.experiment.currency : "USD"

    const monthlyPriceLabel = useMemo(() => {
        if (!variant?.priceMonthly || typeof variant.priceMonthly !== "number") return null
        return `${currency} $${variant.priceMonthly}/mo`
    }, [variant?.priceMonthly, currency])

    const handleJoinWaitlist = async () => {
        await trackPricingEvent({
            event: "waitlist_joined",
            metadata: {
                variant: variant?.name || null,
            },
        })
        toast("Thanks! We recorded your interest in Pro.", "success")
        router.push("/profile")
    }

    const handleUpgradeClick = async () => {
        await trackPricingEvent({
            event: "upgrade_clicked",
            metadata: {
                variant: variant?.name || null,
            },
        })
        toast("Upgrade flow is not connected yet. We'll enable it next.", "info")
    }

    if (loading && !offer) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading pricing...
                    </CardContent>
                </Card>
            </div>
        )
    }

    if (!offer) {
        return (
            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pricing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Log in to see your current Pro offer.
                        </p>
                        <Link href="/login" className="block">
                            <Button className="w-full">Log in</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <Card className="border-primary/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Pro (Early Access)
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Your offer</p>
                        <p className="text-2xl font-semibold">
                            {monthlyPriceLabel || "Pro pricing preview"}
                        </p>
                        {variant?.name && (
                            <p className="text-xs text-muted-foreground">
                                Variant: <span className="font-mono">{variant.name}</span>
                            </p>
                        )}
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <p className="font-medium mb-2">Includes</p>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Higher monthly AI and email limits</li>
                            <li>Priority follow-up automations</li>
                            <li>Fewer interruptions during on-site quoting</li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <Button onClick={handleUpgradeClick} className="w-full justify-between">
                            {variant?.ctaLabel || "Upgrade to Pro"}
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" onClick={handleJoinWaitlist} className="w-full">
                            Join waitlist
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

