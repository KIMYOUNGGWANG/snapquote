export type DeliveryChannel = "email" | "sms"

export type DeliveryIssue = {
    statusLabel: "Action needed" | "Check details" | "Try later" | "Failed"
    title: string
    message: string
    actionHref?: string
    actionLabel?: string
    canRetry: boolean
    targetField?: "email" | "phone" | "message"
}

function includesAny(value: string, fragments: string[]) {
    return fragments.some((fragment) => value.includes(fragment))
}

export function buildDeliveryIssue(input: {
    channel: DeliveryChannel
    message: string
    status?: number
    code?: string
    targetField?: DeliveryIssue["targetField"]
}): DeliveryIssue {
    const message = input.message.trim() || (input.channel === "email" ? "Failed to send email." : "Failed to send SMS.")
    const lowerMessage = message.toLowerCase()

    if (input.targetField) {
        return {
            statusLabel: "Check details",
            title: input.targetField === "email"
                ? "Fix customer email"
                : input.targetField === "phone"
                    ? "Fix customer phone"
                    : "Add a message",
            message,
            canRetry: false,
            targetField: input.targetField,
        }
    }

    if (
        input.status === 402 ||
        input.code === "FREE_PLAN_LIMIT_REACHED" ||
        includesAny(lowerMessage, ["quota", "credits", "free plan limit", "limit reached", "upgrade"])
    ) {
        return {
            statusLabel: "Action needed",
            title: input.channel === "email"
                ? "Upgrade to keep emailing PDFs"
                : "Add SMS credits before sending",
            message,
            actionHref: "/pricing",
            actionLabel: "View plans",
            canRetry: true,
        }
    }

    if (input.status === 429 || includesAny(lowerMessage, ["too many requests", "rate limit"])) {
        return {
            statusLabel: "Try later",
            title: "Too many send attempts",
            message,
            canRetry: true,
        }
    }

    if (includesAny(lowerMessage, ["network", "fetch", "offline", "connection"])) {
        return {
            statusLabel: "Failed",
            title: "Check connection and retry",
            message,
            canRetry: true,
        }
    }

    return {
        statusLabel: "Failed",
        title: input.channel === "email" ? "Email was not sent" : "SMS was not sent",
        message,
        canRetry: true,
    }
}
