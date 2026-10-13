"use client"

import { DollarSign, TrendingUp } from "lucide-react"
import { useEffect, useState } from "react"
import { getEstimates } from "@/lib/estimates-storage"
import { isEstimatePaidLike } from "@/lib/estimate-payment-state"

function isSameMonth(value: string | undefined, month: number, year: number): boolean {
    if (!value) return false

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return false

    return date.getMonth() === month && date.getFullYear() === year
}

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

            estimates.forEach((estimate) => {
                if (isEstimatePaidLike(estimate)) {
                    const paidActivityDate = estimate.paymentCompletedAt || estimate.updatedAt || estimate.createdAt
                    if (isSameMonth(paidActivityDate, currentMonth, currentYear)) {
                        won += estimate.totalAmount
                        count += 1
                    }
                    return
                }

                if (estimate.status === "sent") {
                    const sentActivityDate = estimate.sentAt || estimate.updatedAt || estimate.createdAt
                    if (isSameMonth(sentActivityDate, currentMonth, currentYear)) {
                        pending += estimate.totalAmount
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
        <div className="field-card" data-testid="home-revenue-chart">
            <div className="flex items-center justify-between border-b border-white/10 p-4 pb-3">
                <h2 className="text-sm font-semibold text-white">
                    This Month&apos;s Activity
                </h2>
                <DollarSign className="h-4 w-4 text-blue-200" />
            </div>
            <div className="p-4">
                <div className="text-2xl font-bold text-white" data-testid="home-monthly-revenue">${monthlyRevenue.toLocaleString()}</div>
                <p className="text-xs text-slate-400" data-testid="home-monthly-revenue-helper">
                    Collected this month ({paidCount} paid)
                </p>
                <p className="mt-1 text-xs text-slate-400" data-testid="home-pending-revenue">
                    Pending sent quotes: ${pendingRevenue.toLocaleString()}
                </p>
                <div className="mt-4 flex h-20 items-end gap-2">
                    <div className="relative h-full w-full overflow-hidden rounded-lg bg-slate-950/70">
                        <div
                            className="absolute bottom-0 w-full rounded-t-lg bg-blue-500 transition-all duration-1000"
                            style={{ height: `${Math.min((monthlyRevenue / 10000) * 100, 100)}%` }}
                        />
                    </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                    <TrendingUp className="h-3 w-3 text-emerald-300" />
                    <span>Goal: $10,000</span>
                </div>
            </div>
        </div>
    )
}
