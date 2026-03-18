"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FreeTierQuotaBannerProps {
  used: number
  limit: number
  periodStart: string
  onUpgrade?: () => void
}

function getUsagePercent(used: number, limit: number) {
  if (limit <= 0) {
    return 0
  }

  return Math.min(Math.max((used / limit) * 100, 0), 100)
}

function getResetDays(periodStart: string) {
  const currentPeriodStart = new Date(`${periodStart}T00:00:00`)
  const nextPeriodStart = new Date(
    currentPeriodStart.getFullYear(),
    currentPeriodStart.getMonth() + 1,
    1
  )
  const today = new Date()
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  )
  const daysUntilReset = Math.ceil(
    (nextPeriodStart.getTime() - todayStart.getTime()) / 86400000
  )

  if (Number.isNaN(daysUntilReset)) {
    return 0
  }

  return Math.max(0, daysUntilReset)
}

function getTone(percent: number) {
  if (percent >= 100) {
    return {
      border: "border-red-200/80",
      chip: "bg-red-100 text-red-700",
      fill: "bg-red-500",
      percent: "text-red-600",
    }
  }

  if (percent >= 80) {
    return {
      border: "border-amber-200/80",
      chip: "bg-amber-100 text-amber-700",
      fill: "bg-amber-500",
      percent: "text-amber-600",
    }
  }

  return {
    border: "border-blue-200/80",
    chip: "bg-blue-100 text-blue-700",
    fill: "bg-blue-500",
    percent: "text-blue-600",
  }
}

function UpgradeAction({
  hasReachedLimit,
  onUpgrade,
}: Pick<FreeTierQuotaBannerProps, "onUpgrade"> & {
  hasReachedLimit: boolean
}) {
  if (onUpgrade) {
    return (
      <Button
        type="button"
        size={hasReachedLimit ? "sm" : undefined}
        variant={hasReachedLimit ? "default" : "link"}
        className={cn(
          hasReachedLimit
            ? "w-full sm:w-auto"
            : "h-auto p-0 text-xs font-semibold"
        )}
        onClick={onUpgrade}
      >
        {hasReachedLimit ? "Upgrade now" : "Upgrade for more"}
      </Button>
    )
  }

  return (
    <Button
      asChild
      size={hasReachedLimit ? "sm" : undefined}
      variant={hasReachedLimit ? "default" : "link"}
      className={cn(
        hasReachedLimit ? "w-full sm:w-auto" : "h-auto p-0 text-xs font-semibold"
      )}
    >
      <Link href="/pricing">
        {hasReachedLimit ? "Upgrade now" : "Upgrade for more"}
      </Link>
    </Button>
  )
}

export function FreeTierQuotaBanner({
  used,
  limit,
  periodStart,
  onUpgrade,
}: FreeTierQuotaBannerProps): JSX.Element {
  const safeUsed = Math.max(0, used)
  const safeLimit = Math.max(0, limit)
  const usagePercent = getUsagePercent(safeUsed, safeLimit)
  const hasReachedLimit = safeLimit > 0 && safeUsed >= safeLimit
  const tone = getTone(usagePercent)
  const resetDays = getResetDays(periodStart)
  const filledSegments = Math.round((usagePercent / 100) * 20)
  const resetLabel = resetDays === 1 ? "Resets in 1 day" : `Resets in ${resetDays} days`

  return (
    <section
      className={cn(
        "rounded-2xl border bg-white/85 p-4 shadow-sm backdrop-blur-sm",
        tone.border
      )}
      aria-label="Free tier quota banner"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                tone.chip
              )}
            >
              Free tier
            </span>
            <span className="text-xs font-medium text-slate-500">{resetLabel}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                {safeUsed} of {safeLimit} quotes used this month
              </p>
              <span className={cn("text-sm font-semibold tabular-nums", tone.percent)}>
                {Math.round(usagePercent)}%
              </span>
            </div>

            <div
              className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1"
              aria-hidden="true"
            >
              {Array.from({ length: 20 }, (_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-2 rounded-full bg-slate-200",
                    index < filledSegments && tone.fill
                  )}
                />
              ))}
            </div>
          </div>

          {hasReachedLimit ? (
            <p className="text-sm font-medium text-slate-900">
              Monthly limit reached — upgrade to keep quoting
            </p>
          ) : null}
        </div>

        <div className="shrink-0">
          <UpgradeAction hasReachedLimit={hasReachedLimit} onUpgrade={onUpgrade} />
        </div>
      </div>
    </section>
  )
}
