import { LocalEstimate, getEstimates } from "./estimates-storage";

export interface FollowUpItem {
    estimate: LocalEstimate;
    daysSinceSent: number;
}

export const FOLLOW_UP_THRESHOLD_HOURS = 48;

/**
 * Identifies estimates that need follow-up.
 * Criteria: Status is 'sent' AND created more than 48 hours ago.
 * (Note: Ideally we track 'sentAt', but for MVP 'createdAt' or 'updatedAt' might be used if 'sentAt' missing.
 * However, LocalEstimate has 'createdAt' and 'status'. We assume 'sent' happened close to creation or update.
 * For a more robust check in future, we should add 'sentAt' to the schema. 
 * For now, we'll check createdAt relative to now, if status is sent.)
 */
export async function getEstimatesNeedingFollowUp(): Promise<FollowUpItem[]> {
    const allEstimates = await getEstimates();
    const now = new Date();

    return allEstimates
        .filter(est => est.status === 'sent')
        .map(est => {
            const created = new Date(est.createdAt);
            const diffMs = now.getTime() - created.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
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
        .sort((a, b) => b.daysSinceSent - a.daysSinceSent); // Most urgent first
}

/**
 * Generates a friendly follow-up message text.
 */
export function generateFollowUpMessage(clientName: string, estimateNumber: string): string {
    return `Hi ${clientName}, just checking in on the estimate (${estimateNumber}) I sent over. Let me know if you have any questions!`;
}
