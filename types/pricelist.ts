// Price List Types

export type PriceCategory = "PARTS" | "LABOR" | "SERVICE"
export type PriceUnit = "ea" | "LS" | "hr" | "day" | "SF" | "LF" | "%" | "lb" | "other" | "each" | "hour" | "sqft" | "linear_ft" | "unit"

export interface PriceListItem {
    id: string
    name: string                  // "Kitchen Faucet Replacement"
    price: number                 // 250
    unit: PriceUnit              // "each"
    category: PriceCategory      // "PARTS"
    keywords: string[]           // ["faucet", "수도꼭지", "sink tap"]
    description?: string         // Optional description
    createdAt: string
    updatedAt: string
    usageCount: number           // How often this item is used
}

// For creating new items (without system fields)
export interface CreatePriceListItem {
    name: string
    price: number
    unit: PriceUnit
    category: PriceCategory
    keywords?: string[]
    description?: string
}

// For AI prompt injection
export interface PriceListForAI {
    items: Array<{
        name: string
        price: number
        unit: string
        category: string
        keywords: string[]
    }>
}
