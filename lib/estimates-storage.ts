import { saveEstimateToDB, getEstimatesFromDB, initDB } from "./db"

export interface EstimateItem {
    description: string
    quantity: number
    unit_price: number
    total: number
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
    synced?: boolean
}

export interface BusinessInfo {
    business_name: string
    phone: string
    email: string
    address: string
    license_number: string
    logo_url?: string
    tax_rate?: number
}

// Estimates (IndexedDB)
export async function saveEstimate(estimate: LocalEstimate) {
    return saveEstimateToDB(estimate)
}

export async function getEstimates(): Promise<LocalEstimate[]> {
    const estimates = await getEstimatesFromDB()
    // Sort by date desc
    return estimates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function deleteEstimate(id: string) {
    const db = await initDB()
    return db.delete('estimates', id)
}

export function generateEstimateNumber(): string {
    const prefix = "EST"
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0")
    return `${prefix}-${year}${month}-${random}`
}

// Business Profile (LocalStorage - simpler for settings)
export function saveProfile(profile: BusinessInfo) {
    if (typeof window === 'undefined') return
    localStorage.setItem("snapquote_business_profile", JSON.stringify(profile))
}

export function getProfile(): BusinessInfo | undefined {
    if (typeof window === 'undefined') return undefined
    const stored = localStorage.getItem("snapquote_business_profile")
    if (!stored) return undefined
    try {
        return JSON.parse(stored)
    } catch (e) {
        return undefined
    }
}

// Storage stats (synchronous for profile page)
export function getStorageStats() {
    if (typeof window === 'undefined') return { estimateCount: 0, storageUsed: "0 KB" }

    // Get estimates from localStorage fallback (for stats display)
    const estimatesRaw = localStorage.getItem("snapquote_estimates") || "[]"
    const profileRaw = localStorage.getItem("snapquote_business_profile") || "{}"

    let estimateCount = 0
    try {
        estimateCount = JSON.parse(estimatesRaw).length
    } catch (e) { }

    const totalBytes = estimatesRaw.length + profileRaw.length
    const storageUsed = totalBytes > 1024
        ? `${(totalBytes / 1024).toFixed(1)} KB`
        : `${totalBytes} B`

    return { estimateCount, storageUsed }
}

// Clear all data
export function clearAllEstimates() {
    if (typeof window === 'undefined') return
    localStorage.removeItem("snapquote_estimates")
    localStorage.removeItem("snapquote_business_profile")
    localStorage.removeItem("snapquote_terms_accepted")
    // Also clear IndexedDB
    indexedDB.deleteDatabase('snapquote-db')
}
