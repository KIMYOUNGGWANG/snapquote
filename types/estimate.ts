// Estimate Types

export interface EstimateItem {
    description: string
    quantity: number
    unit_price: number
    total: number
    is_value_add?: boolean
    notes?: string
}

export interface Estimate {
    items: EstimateItem[]
    summary_note: string
    warnings?: string[]
    payment_terms?: string
    closing_note?: string
}

export interface LocalEstimate {
    id: string
    estimateNumber: string
    items: EstimateItem[]
    summary_note: string
    clientName: string
    clientAddress: string
    taxRate: number
    taxAmount: number
    totalAmount: number
    createdAt: string
    synced: boolean
}

export type EstimateStep = "input" | "transcribing" | "verifying" | "generating" | "result"
