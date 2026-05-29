"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TeamEstimateDetailResponse, TeamEstimateSessionResponse } from "@/lib/team"

type TeamSessionAction = "claim" | "heartbeat" | "release" | "takeover"

type TeamEstimateStatusCardProps = {
    activeEditorLabel: string
    context: TeamEstimateDetailResponse["estimate"] | null
    isLoading: boolean
    isMutating: boolean
    onAction: (action: TeamSessionAction) => void
    session: TeamEstimateSessionResponse["session"] | null
}

export function TeamEstimateStatusCard({
    activeEditorLabel,
    context,
    isLoading,
    isMutating,
    onAction,
    session,
}: TeamEstimateStatusCardProps) {
    if (isLoading) {
        return (
            <div className="field-card flex items-center gap-3 p-4 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-blue-300" />
                Loading shared Team estimate...
            </div>
        )
    }

    if (!context) return null

    return (
        <div className="field-card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-white">Shared Team estimate</p>
                    <p className="text-xs text-slate-400">
                        {context.ownerBusinessName || context.ownerUserId} · {context.estimateNumber}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {session?.active ? (
                        <span
                            className={cn(
                                "rounded-lg px-2 py-1 text-xs font-medium",
                                session.ownedByCaller
                                    ? "bg-emerald-500/15 text-emerald-200"
                                    : "bg-amber-500/15 text-amber-200"
                            )}
                        >
                            {session.ownedByCaller ? "You hold edit session" : "Locked by teammate"}
                        </span>
                    ) : (
                        <span className="rounded-lg bg-blue-500/15 px-2 py-1 text-xs font-medium text-blue-200">
                            No active editor
                        </span>
                    )}
                </div>
            </div>
            <p className="text-sm text-slate-300">
                {session?.active
                    ? session.ownedByCaller
                        ? "Shared saves go straight to the Team workspace while your edit session stays active."
                        : `${activeEditorLabel} is editing this estimate right now. Claim or take over the session before saving.`
                    : "Claim the edit session before saving shared changes to this Team estimate."}
            </p>
            <div className="flex flex-wrap gap-2">
                {!session?.active ? (
                    <Button
                        size="sm"
                        className="rounded-lg bg-blue-600 text-white hover:bg-blue-500"
                        onClick={() => onAction("claim")}
                        disabled={isMutating}
                    >
                        {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Claim editing
                    </Button>
                ) : null}
                {session?.active && !session.ownedByCaller ? (
                    <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                        onClick={() => onAction("takeover")}
                        disabled={isMutating}
                    >
                        {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Take over
                    </Button>
                ) : null}
                {session?.ownedByCaller ? (
                    <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                        onClick={() => onAction("release")}
                        disabled={isMutating}
                    >
                        {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Release session
                    </Button>
                ) : null}
            </div>
        </div>
    )
}
