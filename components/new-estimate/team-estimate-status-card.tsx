"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
            <Card className="border-sky-300/30 bg-sky-50/70">
                <CardContent className="flex items-center gap-3 py-4 text-sm text-sky-900">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading shared Team estimate...
                </CardContent>
            </Card>
        )
    }

    if (!context) return null

    return (
        <Card className="border-primary/20">
            <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <p className="text-sm font-semibold">Shared Team estimate</p>
                        <p className="text-xs text-muted-foreground">
                            {context.ownerBusinessName || context.ownerUserId} · {context.estimateNumber}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {session?.active ? (
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${session.ownedByCaller ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                                {session.ownedByCaller ? "You hold edit session" : "Locked by teammate"}
                            </span>
                        ) : (
                            <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800">
                                No active editor
                            </span>
                        )}
                    </div>
                </div>
                <p className="text-sm text-muted-foreground">
                    {session?.active
                        ? session.ownedByCaller
                            ? "Shared saves go straight to the Team workspace while your edit session stays active."
                            : `${activeEditorLabel} is editing this estimate right now. Claim or take over the session before saving.`
                        : "Claim the edit session before saving shared changes to this Team estimate."}
                </p>
                <div className="flex flex-wrap gap-2">
                    {!session?.active ? (
                        <Button size="sm" onClick={() => onAction("claim")} disabled={isMutating}>
                            {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Claim editing
                        </Button>
                    ) : null}
                    {session?.active && !session.ownedByCaller ? (
                        <Button size="sm" variant="outline" onClick={() => onAction("takeover")} disabled={isMutating}>
                            {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Take over
                        </Button>
                    ) : null}
                    {session?.ownedByCaller ? (
                        <Button size="sm" variant="outline" onClick={() => onAction("release")} disabled={isMutating}>
                            {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Release session
                        </Button>
                    ) : null}
                </div>
            </CardContent>
        </Card>
    )
}
