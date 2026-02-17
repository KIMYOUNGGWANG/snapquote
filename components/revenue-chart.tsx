"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"
import { getEstimates } from "@/lib/estimates-storage"

export function RevenueChart() {
    const [monthlyRevenue, setMonthlyRevenue] = useState(0)
    const [pendingRevenue, setPendingRevenue] = useState(0)
    const [paidCount, setPaidCount] = useState(0)

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
                    if (est.status === 'paid') {
                        won += est.totalAmount
                        count += 1
                    } else if (est.status === 'sent') {
                        pending += est.totalAmount
                    }
                }
            })

            setMonthlyRevenue(won)
            setPendingRevenue(pending)
            setPaidCount(count)
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
                <div className="text-2xl font-bold">${monthlyRevenue.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                    Collected this month ({paidCount} paid)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                    Pending sent quotes: ${pendingRevenue.toLocaleString()}
                </p>
                <div className="mt-4 h-[80px] flex items-end gap-2">
                    {/* Simple visualization bar */}
                    <div className="w-full bg-muted rounded-t-sm relative h-full">
                        <div
                            className="bg-primary absolute bottom-0 w-full rounded-t-sm transition-all duration-1000"
                            style={{ height: `${Math.min((monthlyRevenue / 10000) * 100, 100)}%` }} // Scale to 10k goal
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
