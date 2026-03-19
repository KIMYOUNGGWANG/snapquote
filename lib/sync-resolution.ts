export const DEFAULT_SYNC_BUFFER_MS = 1000

export type SyncDirection = "push" | "pull" | "noop"

type SyncTimestampInput = string | null | undefined

function parseSyncTimestamp(value: SyncTimestampInput): number {
    if (!value) return 0

    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : 0
}

export function resolveSyncTimestamp(...values: SyncTimestampInput[]): number {
    for (const value of values) {
        const timestamp = parseSyncTimestamp(value)
        if (timestamp > 0) return timestamp
    }

    return 0
}

export function resolveLwwSyncAction(params: {
    localUpdatedAt?: SyncTimestampInput
    localCreatedAt?: SyncTimestampInput
    cloudUpdatedAt?: SyncTimestampInput
    cloudCreatedAt?: SyncTimestampInput
    bufferMs?: number
}): SyncDirection {
    const bufferMs = params.bufferMs ?? DEFAULT_SYNC_BUFFER_MS
    const localTimestamp = resolveSyncTimestamp(params.localUpdatedAt, params.localCreatedAt)
    const cloudTimestamp = resolveSyncTimestamp(params.cloudUpdatedAt, params.cloudCreatedAt)

    if (localTimestamp > cloudTimestamp + bufferMs) {
        return "push"
    }

    if (cloudTimestamp > localTimestamp + bufferMs) {
        return "pull"
    }

    return "noop"
}
