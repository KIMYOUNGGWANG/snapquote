export type LocalEstimateSaveInput = {
    id: string
    synced?: boolean
    status?: "draft" | "sent" | "paid"
    createdAt?: string
    updatedAt?: string
    [key: string]: unknown
}

export function normalizeEstimateForLocalSave(
    estimate: LocalEstimateSaveInput,
    now = new Date().toISOString(),
) {
    return {
        ...estimate,
        synced: estimate.synced ?? false,
        status: estimate.status || "draft",
        updatedAt: estimate.updatedAt || estimate.createdAt || now,
    }
}
