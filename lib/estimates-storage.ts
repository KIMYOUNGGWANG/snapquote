import { saveEstimateToDB, getEstimatesFromDB, initDB } from "./db"

// Unit types for professional estimating
export type EstimateUnit = 'ea' | 'LS' | 'hr' | 'day' | 'SF' | 'LF' | '%' | 'other'

// Category types
export type EstimateCategory = 'PARTS' | 'LABOR' | 'SERVICE' | 'OTHER'

export interface EstimateItem {
    id: string              // Unique ID for drag-drop
    itemNumber: number      // Display order (editable)
    category: EstimateCategory
    description: string     // No more [PARTS] prefix
    quantity: number
    unit: EstimateUnit
    unit_price: number
    total: number
}

// Attachments for dispute prevention
export interface EstimateAttachments {
    photos: string[]           // base64 data URLs
    audioUrl?: string          // base64 audio data
    originalTranscript?: string // Original voice transcript
}

// Section/Division for large construction projects (CSI Divisions)
export interface EstimateSection {
    id: string
    divisionCode?: string      // e.g., "03" for Concrete, "16" for Electrical
    name: string               // e.g., "Concrete Work", "Electrical"
    items: EstimateItem[]      // Items within this section (Parts + Labor mixed)
}

export interface UpsellOption {
    tier: 'better' | 'best'
    title: string
    description: string
    addedItems: EstimateItem[]
}

export interface LocalEstimate {
    id: string
    estimateNumber: string
    type?: 'estimate' | 'invoice' // Default is 'estimate'
    items: EstimateItem[]      // Legacy: flat items (for backward compatibility)
    sections?: EstimateSection[] // NEW: Division-based grouping
    upsellOptions?: UpsellOption[]
    summary_note: string
    clientName: string
    clientAddress: string
    taxRate: number
    taxAmount: number
    totalAmount: number
    createdAt: string
    sentAt?: string
    synced?: boolean
    status: 'draft' | 'sent' | 'paid'  // Capture-First status
    paymentLink?: string
    paymentLinkId?: string
    paymentLinkType?: 'full' | 'deposit' | 'custom'
    paymentCompletedAt?: string
    lastPaymentSessionId?: string
    attachments?: EstimateAttachments  // Original data preservation
    clientSignature?: string; // base64 image (NEW for Phase 6)
    signedAt?: string; // ISO date (NEW for Phase 6)
    updatedAt: string; // ISO date for sync resolution
}

export interface BusinessInfo {
    business_name: string
    phone: string
    email: string
    address: string
    license_number: string
    logo_url?: string
    tax_rate?: number
    state_province?: string
    tradeType?: string // 'general' | 'plumber' | 'electrician' | 'hvac' | 'handyman'
    estimate_template_url?: string // Custom estimate background (base64)
    payment_link?: string // User's personal payment link (Venmo, PayPal, Stripe)
}

// Estimates (IndexedDB)
// Save all estimates (for Restore)
export async function saveEstimates(estimates: LocalEstimate[]): Promise<void> {
    const db = await initDB()
    const tx = db.transaction('estimates', 'readwrite')
    const store = tx.objectStore('estimates')
    await store.clear() // Wipe existing
    for (const est of estimates) {
        // Ensure strictly typed for DB
        await store.put({
            ...est,
            synced: est.synced ?? false
        })
    }
    await tx.done
}

export async function saveEstimate(estimate: LocalEstimate): Promise<void> {
    const now = new Date().toISOString()
    await saveEstimateToDB({
        ...estimate,
        updatedAt: estimate.updatedAt || now,
        synced: estimate.synced ?? false
    })
}

export async function getEstimates(): Promise<LocalEstimate[]> {
    const estimates = await getEstimatesFromDB() as LocalEstimate[]
    // Sort by updatedAt if available, else createdAt, desc
    return estimates.sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt).getTime()
        const timeB = new Date(b.updatedAt || b.createdAt).getTime()
        return timeB - timeA
    })
}

export async function deleteEstimate(id: string) {
    const db = await initDB()
    return db.delete('estimates', id)
}

// NEW: Get only draft estimates
export async function getDraftEstimates(): Promise<LocalEstimate[]> {
    const estimates = await getEstimates()
    return estimates.filter(e => e.status === 'draft' || !e.status)  // Include legacy estimates without status
}

// NEW: Get only sent estimates
export async function getSentEstimates(): Promise<LocalEstimate[]> {
    const estimates = await getEstimates()
    return estimates.filter(e => e.status === 'sent')
}

// NEW: Get only paid estimates
export async function getPaidEstimates(): Promise<LocalEstimate[]> {
    const estimates = await getEstimates()
    return estimates.filter(e => e.status === 'paid')
}

// NEW: Update estimate status (Legacy)
export async function updateEstimateStatus(id: string, status: 'draft' | 'sent' | 'paid'): Promise<void> {
    const db = await initDB()
    const estimate = await db.get('estimates', id)
    if (estimate) {
        const nowIso = new Date().toISOString()
        const next: any = {
            ...estimate,
            status,
            updatedAt: nowIso,
            // Ensure cloud sync picks up status changes.
            synced: false,
        }

        if (status === 'sent' && !next.sentAt) {
            next.sentAt = nowIso
        }

        await db.put('estimates', next)
    }
}

// NEW: Generic Update (for type: invoice conversion)
export async function updateEstimate(id: string, updates: Partial<LocalEstimate>): Promise<void> {
    const db = await initDB()
    const estimate = await db.get('estimates', id)
    if (estimate) {
        const now = new Date().toISOString()
        await db.put('estimates', {
            ...estimate,
            ...updates,
            updatedAt: now,
            synced: updates.synced ?? false // Usually false if we update content
        })
    }
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

// Storage stats (now async - reads from IndexedDB)
export async function getStorageStats(): Promise<{ estimateCount: number, storageUsed: string }> {
    if (typeof window === 'undefined') return { estimateCount: 0, storageUsed: "0 KB" }

    try {
        // Get estimates from IndexedDB (actual source of truth)
        const estimates = await getEstimates()
        const estimateCount = estimates.length

        // Calculate storage size
        const profileRaw = localStorage.getItem("snapquote_business_profile") || "{}"
        const estimatesSize = JSON.stringify(estimates).length
        const profileSize = profileRaw.length

        const totalBytes = estimatesSize + profileSize
        const storageUsed = totalBytes > 1024 * 1024
            ? `${(totalBytes / 1024 / 1024).toFixed(2)} MB`
            : totalBytes > 1024
                ? `${(totalBytes / 1024).toFixed(1)} KB`
                : `${totalBytes} B`

        return { estimateCount, storageUsed }
    } catch (error) {
        console.error("Error getting storage stats:", error)
        return { estimateCount: 0, storageUsed: "0 KB" }
    }
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

// Onboarding
const ONBOARDING_KEY = "snapquote_onboarding_completed"

export function isFirstVisit(): boolean {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(ONBOARDING_KEY) !== "true"
}

export function markOnboardingCompleted(): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(ONBOARDING_KEY, "true")
}

export function resetOnboarding(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(ONBOARDING_KEY)
}
