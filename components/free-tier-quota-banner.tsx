"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface FreeTierQuotaBannerProps {
  used: number
  limit: number
  periodStart: string
  onUpgrade?: () => void
  pricingHref?: string
}

function getUsagePercent(used: number, limit: number): number {
  if (limit <= 0) {
    return 100
  }

  return Math.min(Math.max((used / limit) * 100, 0), 100)
}

function getResetDays(periodStart: string): number {
  const [year, month] = periodStart.split("-").map(Number)

  if (!year || !month) {
    return 0
  }

  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const nextReset = new Date(year, month, 1)

  return Math.max(
    0,
    Math.ceil((nextReset.getTime() - todayStart.getTime()) / 86400000)
  )
}

function getProgressTone(percent: number) {
  if (percent >= 100) {
    return {
      badge: "border-red-400/30 bg-red-500/10 text-red-200",
      border: "border-red-400/35",
      fill: "bg-red-500",
      link: "text-red-200 hover:text-red-100",
      track: "bg-red-950/50",
    }
  }

  if (percent >= 80) {
    return {
      badge: "border-amber-400/30 bg-amber-500/10 text-amber-200",
      border: "border-amber-400/35",
      fill: "bg-orange-500",
      link: "text-amber-200 hover:text-amber-100",
      track: "bg-amber-950/50",
    }
  }

  return {
    badge: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    border: "border-white/10",
    fill: "bg-blue-500",
    link: "text-blue-200 hover:text-blue-100",
    track: "bg-slate-950/70",
  }
}

function UpgradeControl({
  exhausted,
  onUpgrade,
  linkClassName,
  pricingHref,
}: {
  exhausted: boolean
  onUpgrade?: () => void
  linkClassName: string
  pricingHref: string
}): JSX.Element {
  if (onUpgrade) {
    return (
      <Button
        type="button"
        variant={exhausted ? "default" : "link"}
        size="sm"
        className={exhausted ? "w-full rounded-lg sm:w-auto" : cn("h-auto p-0 text-xs", linkClassName)}
        onClick={onUpgrade}
      >
        {exhausted ? "Upgrade now" : "Upgrade for more"}
      </Button>
    )
  }

  return exhausted ? (
    <Button asChild size="sm" className="w-full rounded-lg sm:w-auto">
      <Link href={pricingHref} data-testid="free-tier-quota-upgrade-link">Upgrade now</Link>
    </Button>
  ) : (
    <Button
      asChild
      variant="link"
      size="sm"
      className={cn("h-auto p-0 text-xs", linkClassName)}
    >
      <Link href={pricingHref} data-testid="free-tier-quota-upgrade-link">Upgrade for more</Link>
    </Button>
  )
}

export function FreeTierQuotaBanner(
  props: FreeTierQuotaBannerProps
): JSX.Element {
  const safeUsed = Math.max(0, props.used)
  const safeLimit = Math.max(0, props.limit)
  const usagePercent = getUsagePercent(safeUsed, safeLimit)
  const tone = getProgressTone(usagePercent)
  const exhausted = safeLimit <= 0 || safeUsed >= safeLimit
  const resetDays = getResetDays(props.periodStart)
  const filledSegments = Math.min(Math.max(Math.ceil(usagePercent / 10), 0), 10)
  const resetLabel = resetDays === 1 ? "Resets in 1 day" : `Resets in ${resetDays} days`
  const pricingHref = props.pricingHref || "/pricing?source=generate_quota"

  return (
    <section
      aria-label="Free tier quota banner"
      className={cn(
        "rounded-lg border bg-slate-900/70 p-4 text-white shadow-[0_16px_36px_-30px_rgba(0,0,0,0.88)] backdrop-blur-sm",
        tone.border
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
              tone.badge
            )}
          >
            Free plan
          </span>
          <span className="text-xs font-medium text-slate-400">{resetLabel}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-slate-100">
              {safeUsed} of {safeLimit} quotes used this month
            </p>
            <span className="text-sm font-semibold text-slate-300">
              {Math.round(usagePercent)}%
            </span>
          </div>

          <div
            aria-hidden="true"
            className={cn("grid grid-cols-10 gap-1 rounded-full p-1", tone.track)}
          >
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "h-2 rounded-full bg-slate-800 transition-colors",
                  index < filledSegments && tone.fill
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-200">
            {exhausted
              ? "Monthly limit reached - upgrade to keep quoting"
              : "Upgrade any time for a higher monthly quota."}
          </p>
          <UpgradeControl
            exhausted={exhausted}
            onUpgrade={props.onUpgrade}
            linkClassName={tone.link}
            pricingHref={pricingHref}
          />
        </div>
      </div>
    </section>
  )
}
