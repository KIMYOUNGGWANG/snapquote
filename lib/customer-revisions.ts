import type { LocalEstimate } from "@/lib/estimates-storage"

export function isSupersededCustomerChangeRequest(
    estimate: Pick<LocalEstimate, "customerPortalStatus" | "supersededByEstimateId">
): boolean {
    return estimate.customerPortalStatus === "change_requested"
        && Boolean(estimate.supersededByEstimateId?.trim())
}

export function isOpenCustomerChangeRequest(
    estimate: Pick<LocalEstimate, "customerPortalStatus" | "supersededByEstimateId">
): boolean {
    return estimate.customerPortalStatus === "change_requested"
        && !isSupersededCustomerChangeRequest(estimate)
}
