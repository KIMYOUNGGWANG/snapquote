import type { EstimateItem, UpsellOption } from "@/lib/estimates-storage"

export const DUPLICATE_ESTIMATE_KEY = "duplicate_estimate"

type DemoEstimateDraft = {
    items: EstimateItem[]
    summary_note: string
    payment_terms: string
    closing_note: string
    warnings: string[]
    upsellOptions: UpsellOption[]
    clientName: string
    clientAddress: string
    taxRate: number
}

export function createDemoEstimateDraft(): DemoEstimateDraft {
    return {
        items: [
            {
                id: "demo-item-1",
                itemNumber: 1,
                category: "PARTS",
                description: "Vanity drain assembly and shutoff parts package",
                quantity: 1,
                unit: "ea",
                unit_price: 185,
                total: 185,
            },
            {
                id: "demo-item-2",
                itemNumber: 2,
                category: "LABOR",
                description: "Remove failed drain, install new assembly, test for leaks",
                quantity: 4,
                unit: "hr",
                unit_price: 95,
                total: 380,
            },
            {
                id: "demo-item-3",
                itemNumber: 3,
                category: "SERVICE",
                description: "Jobsite protection, cleanup, and haul-away",
                quantity: 1,
                unit: "LS",
                unit_price: 85,
                total: 85,
            },
        ],
        summary_note: "Demo quote loaded. Edit the scope, update the client, then save or send the PDF.",
        payment_terms: "50% deposit to schedule. Balance due at completion.",
        closing_note: "Thanks for reviewing this sample field quote.",
        warnings: ["Demo estimate only. Replace pricing, terms, and client details before sending."],
        upsellOptions: [
            {
                tier: "better",
                title: "Upgrade to quarter-turn shutoff valves",
                description: "Reduce future service calls with more reliable shutoff hardware.",
                addedItems: [
                    {
                        id: "demo-upsell-1",
                        itemNumber: 4,
                        category: "PARTS",
                        description: "Quarter-turn shutoff valve set",
                        quantity: 2,
                        unit: "ea",
                        unit_price: 28,
                        total: 56,
                    },
                ],
            },
        ],
        clientName: "Demo Customer",
        clientAddress: "1458 Sample Ave, Vancouver, BC",
        taxRate: 8.5,
    }
}

export function queueDemoEstimateForComposer() {
    if (typeof window === "undefined") return
    window.localStorage.setItem(DUPLICATE_ESTIMATE_KEY, JSON.stringify(createDemoEstimateDraft()))
}
