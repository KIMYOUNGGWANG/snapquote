export const ONBOARDING_LIFECYCLE_STAGES = ["day_0", "day_3", "day_7"] as const

export type OnboardingLifecycleStage = (typeof ONBOARDING_LIFECYCLE_STAGES)[number]

export type LifecycleActivitySummary = {
    draftSavedCount: number
    quoteSentCount: number
    paymentLinkCreatedCount: number
}

export type LifecycleEmailContent = {
    subject: string
    html: string
    preview: string
}

type LifecycleWindow = {
    minHours: number
    maxHours: number
}

const STAGE_WINDOWS: Record<OnboardingLifecycleStage, LifecycleWindow> = {
    day_0: { minHours: 0, maxHours: 24 },
    day_3: { minHours: 72, maxHours: 96 },
    day_7: { minHours: 168, maxHours: 192 },
}

function clampBusinessName(value: string): string {
    const trimmed = value.trim()
    return trimmed || "your business"
}

export function resolveLifecycleStageForAgeHours(
    ageHours: number,
    stageOverride?: OnboardingLifecycleStage,
): OnboardingLifecycleStage | null {
    if (!Number.isFinite(ageHours) || ageHours < 0) return null

    const stages = stageOverride ? [stageOverride] : ONBOARDING_LIFECYCLE_STAGES

    for (const stage of stages) {
        const window = STAGE_WINDOWS[stage]
        if (ageHours >= window.minHours && ageHours < window.maxHours) {
            return stage
        }
    }

    return null
}

export function buildLifecycleActivitySummary(
    events: Array<{ event_name?: string | null }>,
): LifecycleActivitySummary {
    const summary: LifecycleActivitySummary = {
        draftSavedCount: 0,
        quoteSentCount: 0,
        paymentLinkCreatedCount: 0,
    }

    for (const event of events) {
        if (event.event_name === "draft_saved") {
            summary.draftSavedCount += 1
            continue
        }

        if (event.event_name === "quote_sent") {
            summary.quoteSentCount += 1
            continue
        }

        if (event.event_name === "payment_link_created") {
            summary.paymentLinkCreatedCount += 1
        }
    }

    return summary
}

export function shouldSkipLifecycleStage(
    stage: OnboardingLifecycleStage,
    activity: LifecycleActivitySummary,
): boolean {
    if (stage === "day_0") return false
    return activity.quoteSentCount > 0
}

export function buildOnboardingLifecycleEmail(input: {
    stage: OnboardingLifecycleStage
    businessName?: string | null
    appUrl: string
    activity: LifecycleActivitySummary
}): LifecycleEmailContent {
    const businessName = clampBusinessName(input.businessName || "")
    const appUrl = input.appUrl.replace(/\/$/, "")
    const profileUrl = `${appUrl}/profile`
    const newEstimateUrl = `${appUrl}/new-estimate`
    const pricingUrl = `${appUrl}/pricing`

    if (input.stage === "day_0") {
        const subject = `Welcome to SnapQuote, ${businessName}`
        const preview = "Set up your business profile, add one starter price, and send your first quote today."
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.6;">
                <h1 style="color: #111827;">Welcome to SnapQuote</h1>
                <p>You are set up for the fastest path to your first field-ready estimate.</p>
                <p>Start with these three steps:</p>
                <ol>
                    <li>Add your business details so PDFs and emails look professional.</li>
                    <li>Save one starter service item so pricing feels instant.</li>
                    <li>Create your first estimate from notes or voice input.</li>
                </ol>
                <p><a href="${profileUrl}">Finish setup</a> or <a href="${newEstimateUrl}">start your first quote</a>.</p>
                <p>SnapQuote</p>
            </div>
        `

        return { subject, html, preview }
    }

    if (input.stage === "day_3") {
        const hasDraft = input.activity.draftSavedCount > 0
        const subject = hasDraft
            ? "Finish and send your first SnapQuote estimate"
            : "Need help getting your first quote out?"
        const preview = hasDraft
            ? "You already started a draft. Tighten it up and send it today."
            : "Use voice notes or photos on site, then turn them into a clean customer-ready estimate."
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.6;">
                <h1 style="color: #111827;">Your first estimate is close</h1>
                <p>${hasDraft
                    ? "You already have activity in SnapQuote. The next win is getting that first quote out the door."
                    : "Most contractors get value once the first estimate is sent from the field instead of finished at night."}</p>
                <p>Open <a href="${newEstimateUrl}">New Estimate</a> and use your existing price list, voice notes, or photos to finish the draft quickly.</p>
                <p>If your branding still needs work, update it in <a href="${profileUrl}">Profile</a>.</p>
                <p>SnapQuote</p>
            </div>
        `

        return { subject, html, preview }
    }

    const subject = "Turn your first quote into a paid job"
    const preview = "Connect payments, tighten your workflow, and move from draft to cash collected."
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.6;">
            <h1 style="color: #111827;">Move from estimate to payment faster</h1>
            <p>By week one, the biggest unlock is closing the loop: send the quote, attach a payment option, and follow up without chasing manually.</p>
            <ul>
                <li>Create and send your first estimate from <a href="${newEstimateUrl}">New Estimate</a>.</li>
                <li>Connect Stripe in <a href="${profileUrl}">Profile</a> for payment links.</li>
                <li>Review paid features and automation in <a href="${pricingUrl}">Pricing</a>.</li>
            </ul>
            <p>SnapQuote</p>
        </div>
    `

    return { subject, html, preview }
}
