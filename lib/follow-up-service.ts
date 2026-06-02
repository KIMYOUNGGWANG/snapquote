import { LocalEstimate, getEstimates } from "./estimates-storage";
import { needsScopeAssumptionsReview } from "./estimates/draft-state";
import { isEstimatePaidLike } from "./estimate-payment-state";

export interface FollowUpItem {
    estimate: LocalEstimate;
    daysSinceSent: number;
}

export const FOLLOW_UP_THRESHOLD_HOURS = 48;

function getFollowUpReferenceDate(estimate: LocalEstimate): Date {
    const value = estimate.lastFollowedUpAt || estimate.sentAt || estimate.createdAt;
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? new Date(estimate.createdAt) : date;
}

function getFollowUpAgeHours(estimate: LocalEstimate, now: Date): number {
    const followUpReferenceDate = getFollowUpReferenceDate(estimate);
    const diffMs = now.getTime() - followUpReferenceDate.getTime();

    return diffMs / (1000 * 60 * 60);
}

export function isEstimateReadyForFollowUp(estimate: LocalEstimate, now = new Date()): boolean {
    if (isEstimatePaidLike(estimate)) return false;
    if (estimate.status !== 'sent') return false;
    if (estimate.customerPortalStatus === 'approved') return false;
    if (estimate.customerPortalStatus === 'change_requested') return false;
    if (needsScopeAssumptionsReview(estimate)) return false;

    return getFollowUpAgeHours(estimate, now) >= FOLLOW_UP_THRESHOLD_HOURS;
}

function getFollowUpPriority(estimate: LocalEstimate): number {
    if (estimate.customerPortalStatus === "viewed") return 0;
    if (estimate.customerPortalStatus === "shared" || estimate.customerPortalUrl) return 1;

    return 2;
}

/**
 * Identifies estimates that need follow-up.
 * Criteria: Status is 'sent' AND sent/last followed up more than 48 hours ago.
 */
export async function getEstimatesNeedingFollowUp(): Promise<FollowUpItem[]> {
    const allEstimates = await getEstimates();
    const now = new Date();

    return allEstimates
        .filter(est => isEstimateReadyForFollowUp(est, now))
        .map(est => {
            const diffHours = getFollowUpAgeHours(est, now);
            return {
                estimate: est,
                diffHours
            };
        })
        .filter(item => item.diffHours >= FOLLOW_UP_THRESHOLD_HOURS)
        .map(item => ({
            estimate: item.estimate,
            daysSinceSent: Math.floor(item.diffHours / 24)
        }))
        .sort((a, b) => {
            const priorityDelta = getFollowUpPriority(a.estimate) - getFollowUpPriority(b.estimate);
            if (priorityDelta !== 0) return priorityDelta;

            return b.daysSinceSent - a.daysSinceSent;
        });
}

/**
 * Generates a friendly follow-up message text.
 */
export function generateFollowUpMessage(
    clientName: string,
    estimateNumber: string,
    approvalLink?: string,
    customerPortalStatus?: LocalEstimate["customerPortalStatus"],
): string {
    if (approvalLink && customerPortalStatus === "viewed") {
        return `Hi ${clientName || "there"}, just checking in on the estimate (${estimateNumber}) I sent over. If the scope looks good, you can approve it or request changes here: ${approvalLink} Let me know if you have any questions!`;
    }

    const approvalLine = approvalLink
        ? ` You can review or approve it here: ${approvalLink}`
        : "";

    return `Hi ${clientName || "there"}, just checking in on the estimate (${estimateNumber}) I sent over.${approvalLine} Let me know if you have any questions!`;
}
