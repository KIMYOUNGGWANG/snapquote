"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, Save, Building2, Upload, X, Plus, Pencil, Trash2, DollarSign, Link2, ExternalLink, RefreshCw } from "lucide-react"
import Image from "next/image"
import { getProfile, saveProfile, clearAllEstimates, getStorageStats, type BusinessInfo } from "@/lib/estimates-storage"
import { getPriceList, savePriceListItem, deletePriceListItem } from "@/lib/db"
import { toast } from "@/components/toast"
import { PriceListModal } from "@/components/price-list-modal"
import type { PriceListItem, CreatePriceListItem } from "@/types"
import { generateFullBackupJSON, type SnapQuoteBackup } from "@/lib/export-service"
import { saveEstimates } from "@/lib/estimates-storage"
import { savePriceList } from "@/lib/db"
import { withAuthHeaders } from "@/lib/auth-headers"
import { useAuthGuard } from "@/lib/use-auth-guard"

type StripeConnectStatus = {
    connected: boolean
    accountId?: string
    detailsSubmitted?: boolean
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
}

export default function ProfilePage() {
    const router = useRouter()
    const { authResolved, isAuthenticated } = useAuthGuard("/profile")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [profile, setProfile] = useState<BusinessInfo>({
        business_name: "",
        phone: "",
        email: "",
        address: "",
        license_number: "",
        tax_rate: 13,
        logo_url: "",
        state_province: "ON"
    })
    const [uploading, setUploading] = useState(false)
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [storageStats, setStorageStats] = useState({ estimateCount: 0, storageUsed: "0 KB" })

    // Price List state
    const [priceList, setPriceList] = useState<PriceListItem[]>([])
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false)
    const [editingPriceItem, setEditingPriceItem] = useState<PriceListItem | null>(null)
    const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectStatus | null>(null)
    const [stripeStatusLoading, setStripeStatusLoading] = useState(false)
    const [stripeConnecting, setStripeConnecting] = useState(false)
    const [stripeDashboardLoading, setStripeDashboardLoading] = useState(false)

    const loadStripeConnectStatus = useCallback(async () => {
        setStripeStatusLoading(true)
        try {
            const headers = await withAuthHeaders()
            const response = await fetch("/api/stripe/connect/status", {
                method: "GET",
                headers,
                cache: "no-store",
            })

            if (response.status === 401) {
                setStripeConnectStatus(null)
                return
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || "Failed to load Stripe Connect status.")
            }

            const data = await response.json()
            setStripeConnectStatus(data)
        } catch (error) {
            console.error("Failed to load Stripe Connect status:", error)
        } finally {
            setStripeStatusLoading(false)
        }
    }, [])

    useEffect(() => {
        if (typeof window === "undefined") return
        const stripeState = new URLSearchParams(window.location.search).get("stripe")
        if (stripeState === "return") {
            toast("✅ Stripe onboarding returned. Refreshing status...", "success")
            void loadStripeConnectStatus()
        } else if (stripeState === "refresh") {
            toast("ℹ️ Stripe onboarding was interrupted. Continue when ready.", "info")
        }
    }, [loadStripeConnectStatus])

    const loadProfile = useCallback(async () => {
        try {
            const savedProfile = getProfile()
            if (savedProfile) {
                setProfile(savedProfile)
                if (savedProfile.logo_url) {
                    setLogoPreview(savedProfile.logo_url)
                }
            }
            // Load price list
            const prices = await getPriceList()
            setPriceList(prices)
            // getStorageStats is now async
            const stats = await getStorageStats()
            setStorageStats(stats)
            await loadStripeConnectStatus()
        } catch (error) {
            console.error("Error loading profile:", error)
        } finally {
            setLoading(false)
        }
    }, [loadStripeConnectStatus])

    useEffect(() => {
        if (!authResolved || !isAuthenticated) return
        void loadProfile()
    }, [authResolved, isAuthenticated, loadProfile])

    const handleConnectStripe = async () => {
        setStripeConnecting(true)
        try {
            const headers = await withAuthHeaders({ "content-type": "application/json" })
            const response = await fetch("/api/stripe/connect/onboard", {
                method: "POST",
                headers,
            })

            if (response.status === 401) {
                toast("🔐 Log in first to connect Stripe.", "warning")
                router.push("/login")
                return
            }

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "Failed to start Stripe onboarding.")
            }

            if (typeof data.url !== "string" || !data.url) {
                throw new Error("Stripe onboarding URL is missing.")
            }

            window.location.href = data.url
        } catch (error: any) {
            console.error("Stripe connect onboarding failed:", error)
            toast(`❌ ${error.message || "Failed to connect Stripe."}`, "error")
        } finally {
            setStripeConnecting(false)
        }
    }

    const handleOpenStripeDashboard = async () => {
        setStripeDashboardLoading(true)
        try {
            const headers = await withAuthHeaders({ "content-type": "application/json" })
            const response = await fetch("/api/stripe/connect/dashboard-link", {
                method: "POST",
                headers,
            })

            if (response.status === 401) {
                toast("🔐 Log in first to open Stripe dashboard.", "warning")
                router.push("/login")
                return
            }

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "Failed to open Stripe dashboard.")
            }

            if (typeof data.url !== "string" || !data.url) {
                throw new Error("Stripe dashboard URL is missing.")
            }

            window.open(data.url, "_blank", "noopener,noreferrer")
        } catch (error: any) {
            console.error("Stripe dashboard link failed:", error)
            toast(`❌ ${error.message || "Failed to open Stripe dashboard."}`, "error")
        } finally {
            setStripeDashboardLoading(false)
        }
    }

    const handleSavePriceItem = async (item: CreatePriceListItem & { id?: string }) => {
        await savePriceListItem({ ...item, keywords: item.keywords || [] })
        const prices = await getPriceList()
        setPriceList(prices)
        toast(item.id ? "✅ Price item updated!" : "✅ Price item added!", "success")
    }

    const handleDeletePriceItem = async (id: string) => {
        if (confirm("Delete this price item?")) {
            await deletePriceListItem(id)
            const prices = await getPriceList()
            setPriceList(prices)
            toast("🗑️ Price item deleted.", "success")
        }
    }

    const handleEditPriceItem = (item: PriceListItem) => {
        setEditingPriceItem(item)
        setIsPriceModalOpen(true)
    }

    const handleAddPriceItem = () => {
        setEditingPriceItem(null)
        setIsPriceModalOpen(true)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            saveProfile(profile)
            toast("✅ Profile saved!", "success")
            const stats = await getStorageStats()
            setStorageStats(stats)
        } catch (error) {
            console.error("Error saving profile:", error)
            toast("❌ Failed to save profile.", "error")
        } finally {
            setSaving(false)
        }
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast('⚠️ Please upload an image file', 'error')
            return
        }

        setUploading(true)
        try {
            // Convert to base64 for localStorage
            const reader = new FileReader()
            reader.onloadend = () => {
                const base64 = reader.result as string
                setProfile({ ...profile, logo_url: base64 })
                setLogoPreview(base64)
                setUploading(false)
            }
            reader.onerror = () => {
                toast('❌ Failed to upload logo', 'error')
                setUploading(false)
            }
            reader.readAsDataURL(file)
        } catch (error) {
            console.error('Error uploading logo:', error)
            toast('❌ Failed to upload logo', 'error')
            setUploading(false)
        }
    }

    const handleRemoveLogo = () => {
        setProfile({ ...profile, logo_url: "" })
        setLogoPreview(null)
    }

    const handleClearData = async () => {
        if (confirm("⚠️ This will delete ALL your estimates and profile data. This cannot be undone. Are you sure?")) {
            clearAllEstimates()
            setProfile({
                business_name: "",
                phone: "",
                email: "",
                address: "",
                license_number: "",
                tax_rate: 13,
                logo_url: "",
                state_province: "ON"
            })
            setLogoPreview(null)
            toast("🗑️ All data cleared.", "success")
            const stats = await getStorageStats()
            setStorageStats(stats)
        }
    }

    if (!authResolved || !isAuthenticated || loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto space-y-6 pb-20">
            <CardHeader className="px-0">
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                    <Building2 className="h-6 w-6" />
                    Business Profile
                </CardTitle>
                <CardDescription>
                    This information will appear on your estimates and PDFs.
                </CardDescription>
            </CardHeader>

            <Card>
                <CardContent className="pt-6 space-y-4">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                        <Label>Business Logo</Label>
                        <div className="flex items-center gap-4">
                            {logoPreview ? (
                                <div className="relative w-24 h-24 border-2 border-muted rounded-lg overflow-hidden">
                                    <Image
                                        src={logoPreview}
                                        alt="Business Logo"
                                        fill
                                        className="object-contain p-2"
                                    />
                                    <button
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-24 border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center bg-muted/50">
                                    <Upload className="h-6 w-6 text-muted-foreground" />
                                </div>
                            )}
                            <div className="flex-1">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={uploading}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Upload your company logo (appears on PDF header)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Estimate Template Upload */}
                    <div className="space-y-2">
                        <Label>견적서 양식 (Estimate Template)</Label>
                        <div className="flex items-center gap-4">
                            {profile.estimate_template_url ? (
                                <div className="relative w-24 h-32 border-2 border-primary/50 rounded-lg overflow-hidden bg-muted">
                                    <Image
                                        src={profile.estimate_template_url}
                                        alt="Estimate Template"
                                        fill
                                        className="object-contain p-1"
                                    />
                                    <button
                                        onClick={() => setProfile({ ...profile, estimate_template_url: "" })}
                                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-32 border-2 border-dashed border-primary/30 rounded-lg flex flex-col items-center justify-center bg-primary/5">
                                    <Upload className="h-5 w-5 text-primary/50 mb-1" />
                                    <span className="text-[10px] text-primary/50">A4</span>
                                </div>
                            )}
                            <div className="flex-1">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        const reader = new FileReader()
                                        reader.onloadend = () => {
                                            setProfile({ ...profile, estimate_template_url: reader.result as string })
                                        }
                                        reader.readAsDataURL(file)
                                    }}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    📄 회사 견적서 양식을 업로드하세요 (PDF 배경으로 사용됩니다)
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    권장: A4 크기 (210×297mm) 이미지. 없으면 기본 양식이 사용됩니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="business_name">Business Name *</Label>
                        <Input
                            id="business_name"
                            value={profile.business_name}
                            onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                            placeholder="Your Company Name"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="payment_link">Manual Payment Link (Optional)</Label>
                        <div className="flex gap-2">
                            <Input
                                id="payment_link"
                                value={profile.payment_link || ""}
                                onChange={(e) => setProfile({ ...profile, payment_link: e.target.value })}
                                placeholder="https://venmo.com/u/yourname or Stripe Link"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Optional fallback for Venmo/PayPal/CashApp links.
                            Stripe card payment links are now managed through Stripe Connect below.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                            id="phone"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            placeholder="(416) 555-1234"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            placeholder="contact@yourcompany.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="address">Business Address</Label>
                        <Input
                            id="address"
                            value={profile.address}
                            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                            placeholder="123 Main St, Toronto, ON"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="state_province">State / Province (For Legal Templates)</Label>
                        <select
                            id="state_province"
                            value={profile.state_province || "ON"}
                            onChange={(e) => setProfile({ ...profile, state_province: e.target.value })}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="ON">Ontario (Canada)</option>
                            <option value="BC">British Columbia (Canada)</option>
                            <option value="AB">Alberta (Canada)</option>
                            <option value="CA">California (USA)</option>
                            <option value="TX">Texas (USA)</option>
                            <option value="NY">New York (USA)</option>
                            <option value="FL">Florida (USA)</option>
                            <option value="OTHER">Other / General</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Required legal disclaimers will be added to PDF based on this.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="license">License Number</Label>
                        <Input
                            id="license"
                            value={profile.license_number}
                            onChange={(e) => setProfile({ ...profile, license_number: e.target.value })}
                            placeholder="LIC-123456"
                        />
                        <p className="text-xs text-muted-foreground">
                            Your trade license number (will appear on PDF footer)
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tax_rate">Default Tax Rate (%)</Label>
                        <Input
                            id="tax_rate"
                            type="number"
                            value={profile.tax_rate}
                            onChange={(e) => setProfile({ ...profile, tax_rate: Number(e.target.value) })}
                            placeholder="13"
                        />
                        <p className="text-xs text-muted-foreground">
                            HST/GST rate for your region (e.g., Ontario = 13%)
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Button
                className="w-full h-12 text-lg font-semibold"
                onClick={handleSave}
                disabled={saving}
            >
                {saving ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                    </>
                ) : (
                    <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Profile
                    </>
                )}
            </Button>

            <Card className="border-primary/30">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Link2 className="h-5 w-5" />
                        Stripe Connect (Company-Owned Payments)
                    </CardTitle>
                    <CardDescription>
                        Each business manages its own payments, payouts, refunds, and disputes in Stripe.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {stripeStatusLoading ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Stripe status...
                        </p>
                    ) : (
                        <>
                            <div className="rounded-lg border p-3 bg-muted/40">
                                {!stripeConnectStatus ? (
                                    <p className="text-sm text-muted-foreground">
                                        Log in to connect your company Stripe account.
                                    </p>
                                ) : stripeConnectStatus.connected && stripeConnectStatus.detailsSubmitted && stripeConnectStatus.chargesEnabled ? (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-emerald-700">Connected and ready to accept card payments.</p>
                                        {stripeConnectStatus.accountId && (
                                            <p className="text-xs text-muted-foreground font-mono">{stripeConnectStatus.accountId}</p>
                                        )}
                                    </div>
                                ) : stripeConnectStatus.connected ? (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-700">Connected, but onboarding is incomplete.</p>
                                        {stripeConnectStatus.accountId && (
                                            <p className="text-xs text-muted-foreground font-mono">{stripeConnectStatus.accountId}</p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        Stripe is not connected yet.
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    className="flex-1"
                                    onClick={handleConnectStripe}
                                    disabled={stripeConnecting}
                                >
                                    {stripeConnecting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Opening...
                                        </>
                                    ) : (
                                        <>
                                            <Link2 className="h-4 w-4 mr-2" />
                                            {stripeConnectStatus?.connected ? "Resume Onboarding" : "Connect Stripe"}
                                        </>
                                    )}
                                </Button>

                                <Button
                                    variant="outline"
                                    onClick={handleOpenStripeDashboard}
                                    disabled={stripeDashboardLoading || !stripeConnectStatus?.connected}
                                >
                                    {stripeDashboardLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <ExternalLink className="h-4 w-4" />
                                    )}
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={loadStripeConnectStatus}
                                    disabled={stripeStatusLoading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${stripeStatusLoading ? "animate-spin" : ""}`} />
                                </Button>
                            </div>

                            {!stripeConnectStatus?.connected && (
                                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <p className="text-xs text-blue-200 leading-relaxed text-center">
                                        💡 Connect your bank account with Stripe, our secure payment partner, to start receiving Credit Card and Apple Pay payments directly through SnapQuote. (Takes ~3 minutes)
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Price List Section */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            <CardTitle className="text-lg">My Price List</CardTitle>
                        </div>
                        <Button size="sm" onClick={handleAddPriceItem}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                        </Button>
                    </div>
                    <CardDescription>
                        AI will use these fixed prices for consistent estimates.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {priceList.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No price items yet.</p>
                            <p className="text-xs">Add items to ensure consistent pricing.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {["PARTS", "LABOR", "SERVICE"].map(category => {
                                const items = priceList.filter(p => p.category === category)
                                if (items.length === 0) return null
                                return (
                                    <div key={category}>
                                        <p className="text-xs font-semibold text-muted-foreground mb-1">{category}</p>
                                        {items.map(item => (
                                            <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-sm truncate">{item.name}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        ${item.price}/{item.unit}
                                                        {item.keywords.length > 0 && ` • ${item.keywords.join(", ")}`}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1 ml-2">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditPriceItem(item)}>
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeletePriceItem(item.id)}>
                                                        <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Price List Modal */}
            <PriceListModal
                open={isPriceModalOpen}
                onClose={() => {
                    setIsPriceModalOpen(false)
                    setEditingPriceItem(null)
                }}
                onSave={handleSavePriceItem}
                editItem={editingPriceItem}
            />

            {/* Storage Info */}
            <Card className="border-dashed">
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm">📊 Storage Information</h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Estimates Saved</p>
                                <p className="font-bold text-lg">{storageStats.estimateCount}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Storage Used</p>
                                <p className="font-bold text-lg">{storageStats.storageUsed}</p>
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            💡 All data is stored locally in your browser
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Clear Data Section */}
            <Card className="border-destructive/50">
                <CardContent className="pt-6">
                    <div className="space-y-3">
                        <h3 className="font-semibold text-sm text-destructive">⚠️ Danger Zone</h3>
                        <p className="text-sm text-muted-foreground">
                            Clear all estimates and profile data from this browser.
                        </p>
                        <Button
                            variant="destructive"
                            className="w-full"
                            onClick={handleClearData}
                        >
                            Clear All Data
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
