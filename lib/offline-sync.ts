import { getUnprocessedAudio } from "./db"
import { getEstimates, type LocalEstimate } from "./estimates-storage"

export interface PendingSyncSummary {
    draftCount: number
    sentCount: number
    paidCount: number
    unsyncedEstimateCount: number
    pendingAudioCount: number
    totalPendingCount: number
}

type PendingEstimate = Pick<LocalEstimate, "status" | "synced">

export function summarizePendingSync(
    estimates: PendingEstimate[],
    pendingAudioCount = 0,
): PendingSyncSummary {
    let draftCount = 0
    let sentCount = 0
    let paidCount = 0

    for (const estimate of estimates) {
        if (estimate.synced !== false) continue

        if (estimate.status === "sent") {
            sentCount += 1
            continue
        }

        if (estimate.status === "paid") {
            paidCount += 1
            continue
        }

        draftCount += 1
    }

    const unsyncedEstimateCount = draftCount + sentCount + paidCount
    const safePendingAudioCount = Math.max(0, pendingAudioCount)

    return {
        draftCount,
        sentCount,
        paidCount,
        unsyncedEstimateCount,
        pendingAudioCount: safePendingAudioCount,
        totalPendingCount: unsyncedEstimateCount + safePendingAudioCount,
    }
}

export async function getPendingSyncSummary(): Promise<PendingSyncSummary> {
    const [estimates, pendingAudio] = await Promise.all([
        getEstimates(),
        getUnprocessedAudio(),
    ])

    return summarizePendingSync(estimates, pendingAudio.length)
}

export function formatPendingSyncSummary(summary: PendingSyncSummary): string {
    if (summary.totalPendingCount === 0) {
        return "All local changes are synced."
    }

    const parts: string[] = []

    if (summary.draftCount > 0) {
        parts.push(`${summary.draftCount} draft${summary.draftCount === 1 ? "" : "s"}`)
    }

    if (summary.sentCount > 0) {
        parts.push(`${summary.sentCount} sent quote${summary.sentCount === 1 ? "" : "s"}`)
    }

    if (summary.paidCount > 0) {
        parts.push(`${summary.paidCount} paid update${summary.paidCount === 1 ? "" : "s"}`)
    }

    if (summary.pendingAudioCount > 0) {
        parts.push(`${summary.pendingAudioCount} recording${summary.pendingAudioCount === 1 ? "" : "s"}`)
    }

    return parts.join(" • ")
}
