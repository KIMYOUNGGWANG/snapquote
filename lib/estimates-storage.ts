/**
 * Local Storage Service for Estimates
 * Manages estimates in browser localStorage without requiring authentication
 */

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
}

const STORAGE_KEYS = {
    ESTIMATES: 'snapquote_estimates',
    COUNTER: 'snapquote_estimate_counter',
    PROFILE: 'snapquote_profile'
}

/**
 * Generate next estimate number in format EST-YYYY-NNN
 */
export function generateEstimateNumber(): string {
    const year = new Date().getFullYear()
    const count = getEstimateCounter()
    const newCount = count + 1

    // Save incremented counter
    localStorage.setItem(STORAGE_KEYS.COUNTER, JSON.stringify(newCount))

    return `EST-${year}-${String(newCount).padStart(3, '0')}`
}

/**
 * Get current estimate counter
 */
function getEstimateCounter(): number {
    try {
        const counter = localStorage.getItem(STORAGE_KEYS.COUNTER)
        return counter ? JSON.parse(counter) : 0
    } catch {
        return 0
    }
}

/**
 * Save estimate to localStorage
 */
export function saveEstimate(estimate: LocalEstimate): void {
    try {
        const estimates = getEstimates()

        // Check if estimate already exists (update case)
        const existingIndex = estimates.findIndex(e => e.id === estimate.id)

        if (existingIndex >= 0) {
            estimates[existingIndex] = estimate
        } else {
            estimates.push(estimate)
        }

        localStorage.setItem(STORAGE_KEYS.ESTIMATES, JSON.stringify(estimates))
    } catch (error) {
        console.error('Failed to save estimate:', error)
        throw new Error('Storage quota exceeded. Please delete old estimates.')
    }
}

/**
 * Get all estimates from localStorage
 */
export function getEstimates(): LocalEstimate[] {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ESTIMATES)
        return data ? JSON.parse(data) : []
    } catch (error) {
        console.error('Failed to load estimates:', error)
        return []
    }
}

/**
 * Get single estimate by ID
 */
export function getEstimate(id: string): LocalEstimate | null {
    const estimates = getEstimates()
    return estimates.find(e => e.id === id) || null
}

/**
 * Delete estimate by ID
 */
export function deleteEstimate(id: string): void {
    try {
        const estimates = getEstimates()
        const filtered = estimates.filter(e => e.id !== id)
        localStorage.setItem(STORAGE_KEYS.ESTIMATES, JSON.stringify(filtered))
    } catch (error) {
        console.error('Failed to delete estimate:', error)
    }
}

/**
 * Clear all estimates (use with caution!)
 */
export function clearAllEstimates(): void {
    localStorage.removeItem(STORAGE_KEYS.ESTIMATES)
    localStorage.removeItem(STORAGE_KEYS.COUNTER)
}

/**
 * Get storage usage stats
 */
export function getStorageStats(): { estimateCount: number; storageUsed: string } {
    const estimates = getEstimates()
    const dataString = localStorage.getItem(STORAGE_KEYS.ESTIMATES) || ''
    const bytes = new Blob([dataString]).size
    const kb = (bytes / 1024).toFixed(2)

    return {
        estimateCount: estimates.length,
        storageUsed: `${kb} KB`
    }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
    try {
        const test = '__storage_test__'
        localStorage.setItem(test, test)
        localStorage.removeItem(test)
        return true
    } catch {
        return false
    }
}

/**
 * Save business profile to localStorage
 */
export interface BusinessInfo {
    business_name?: string
    phone?: string
    email?: string
    address?: string
    license_number?: string
    tax_rate?: number
    logo_url?: string
}

export function saveProfile(profile: BusinessInfo): void {
    try {
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile))
    } catch (error) {
        console.error('Failed to save profile:', error)
    }
}

/**
 * Get business profile from localStorage
 */
export function getProfile(): BusinessInfo | null {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.PROFILE)
        return data ? JSON.parse(data) : null
    } catch {
        return null
    }
}
