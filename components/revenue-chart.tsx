"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"
import { getEstimates, type LocalEstimate } from "@/lib/estimates-storage"

export function RevenueChart() {
    const [monthlyRevenue, setMonthlyRevenue] = useState(0)
    const [pendingRevenue, setPendingRevenue] = useState(0)
    const [wonCount, setWonCount] = useState(0)

    useEffect(() => {
        const loadStats = async () => {
            const estimates = await getEstimates()
            const currentMonth = new Date().getMonth()
            const currentYear = new Date().getFullYear()

            let won = 0
            let pending = 0
            let count = 0

            estimates.forEach(est => {
                const date = new Date(est.createdAt)
                if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
                    // Note: In MVP we don't have a 'won' status explicitly yet, 
                    // but we can simulate it or check if user marked it.
                    // For now, let's assume 'sent' estimates are 'pending' 
                    // and we might need a way to mark as 'won'.
                    // As per Phase 2 plan: "marked as won". 
                    // Since we haven't implemented 'mark as won' UI yet, 
                    // we will treat 'sent' as potential revenue for now, or check for a specific status if we add it.
                    // Let's stick to 'sent' = pending, and maybe we need to add 'won' status handling.
                    // For this MVP step, let's just show 'Total Estimated' this month.

                    if (est.status === 'sent') {
                        pending += est.totalAmount
                    }
                    // If we had 'won' status:
                    // if (est.status === 'won') won += est.totalAmount
                }
            })

            // To make this chart useful immediately without changing data model deeply:
            // Let's show "Total Estimated This Month"
            setPendingRevenue(pending)
            setWonCount(count)
        }
        loadStats()
    }, [])

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    This Month&apos;s Activity
                </CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">${pendingRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                    Estimated across active jobs
                </p>
                <div className="mt-4 h-[80px] flex items-end gap-2">
                    {/* Simple visualization bar */}
                    <div className="w-full bg-muted rounded-t-sm relative h-full">
                        <div
                            className="bg-primary absolute bottom-0 w-full rounded-t-sm transition-all duration-1000"
                            style={{ height: `${Math.min((pendingRevenue / 10000) * 100, 100)}%` }} // Scale to 10k goal
                        />
                    </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span>Goal: $10,000</span>
                </div>
            </CardContent>
        </Card>
    )
}
