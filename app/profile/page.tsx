"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Loader2, Save, Building2, Upload, X, Plus, Pencil, Trash2, DollarSign, Link2, ExternalLink, RefreshCw, Sparkles, Lock, Users, CreditCard, Database, ShieldCheck } from "lucide-react"
import Image from "next/image"
import { getEstimates, getProfile, saveProfile, clearAllEstimates, getStorageStats, type BusinessInfo } from "@/lib/estimates-storage"
import { getPriceList, savePriceListItem, deletePriceListItem } from "@/lib/db"
import { toast } from "@/components/toast"
import { PriceListModal } from "@/components/price-list-modal"
import type { PriceListItem, CreatePriceListItem } from "@/types"
import { generateFullBackupJSON } from "@/lib/export-service"
import { withAuthHeaders } from "@/lib/auth-headers"
import { useAuthGuard } from "@/lib/use-auth-guard"
import { AuthGate } from "@/components/auth-gate"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { ReferralStatusCard } from "@/components/referral-status-card"
import { LanguageSelector } from "@/components/language-selector"
import { getBillingSubscriptionStatus, type BillingSubscriptionStatusResponse } from "@/lib/pricing"
import { hasPdfBrandingAccess, hasPdfTemplateAccess } from "@/lib/pdf-branding"
import { validateAndNormalizeBusinessProfile } from "@/lib/profile-validation"

type StripeConnectStatus = {
    connected: boolean
    accountId?: string
    detailsSubmitted?: boolean
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
}

function getStripeStatusLabel(status: StripeConnectStatus | null): string {
    if (!status?.connected) return "Not connected"
    if (status.detailsSubmitted && status.chargesEnabled) return "Ready to take payments"
    return "Onboarding incomplete"
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
        state_province: "ON",
        payment_link: "",
        estimate_template_url: "",
    })
    const [uploading, setUploading] = useState(false)
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [storageStats, setStorageStats] = useState({ estimateCount: 0, storageUsed: "0 KB" })

    // Price List state
    const [priceList, setPriceList] = useState<PriceListItem[]>([])
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false)
    const [editingPriceItem, setEditingPriceItem] = useState<PriceListItem | null>(null)
    const [priceItemToDelete, setPriceItemToDelete] = useState<PriceListItem | null>(null)
    const [clearDataConfirmOpen, setClearDataConfirmOpen] = useState(false)
    const [stripeConnectStatus, setStripeConnectStatus] = useState<StripeConnectStatus | null>(null)
    const [stripeStatusLoading, setStripeStatusLoading] = useState(false)
    const [stripeConnecting, setStripeConnecting] = useState(false)
    const [stripeDashboardLoading, setStripeDashboardLoading] = useState(false)
    const [subscription, setSubscription] = useState<BillingSubscriptionStatusResponse | null>(null)

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
            toast("Stripe onboarding returned. Refreshing status...", "success")
            void loadStripeConnectStatus()
        } else if (stripeState === "refresh") {
            toast("Stripe onboarding was interrupted. Continue when ready.", "info")
        }
    }, [loadStripeConnectStatus])

    const loadProfile = useCallback(async () => {
        try {
            // Priority 1: Supabase (Server State)
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                const { data: dbProfile, error: dbError } = await supabase
                    .from("profiles")
                    .select("business_name, phone, email, address, license_number, tax_rate, logo_url, state_province, payment_link, estimate_template_url")
                    .eq("id", session.user.id)
                    .single()

                if (dbProfile && !dbError) {
                    const mappedProfile: BusinessInfo = {
                        business_name: dbProfile.business_name || "",
                        phone: dbProfile.phone || "",
                        email: dbProfile.email || "",
                        address: dbProfile.address || "",
                        license_number: dbProfile.license_number || "",
                        tax_rate: dbProfile.tax_rate ?? 13,
                        logo_url: dbProfile.logo_url || "",
                        state_province: dbProfile.state_province || "ON",
                        payment_link: dbProfile.payment_link || "",
                        estimate_template_url: dbProfile.estimate_template_url || "",
                    }
                    setProfile(mappedProfile)
                    if (mappedProfile.logo_url) setLogoPreview(mappedProfile.logo_url)
                    // Also sync to local storage for offline use
                    saveProfile(mappedProfile)
                } else {
                    // Priority 2: Local Storage (Fallback)
                    const savedProfile = getProfile()
                    if (savedProfile) {
                        setProfile(savedProfile)
                        if (savedProfile.logo_url) setLogoPreview(savedProfile.logo_url)
                    }
                }
            }

            // Load price list
            const prices = await getPriceList()
            setPriceList(prices)
            const subscriptionResult = await getBillingSubscriptionStatus()
            setSubscription(subscriptionResult)
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
                toast("Log in first to connect Stripe.", "warning")
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
        } catch (error: unknown) {
            console.error("Stripe connect onboarding failed:", error)
            toast(error instanceof Error ? error.message : "Failed to connect Stripe.", "error")
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
                toast("Log in first to open Stripe dashboard.", "warning")
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
        } catch (error: unknown) {
            console.error("Stripe dashboard link failed:", error)
            toast(error instanceof Error ? error.message : "Failed to open Stripe dashboard.", "error")
        } finally {
            setStripeDashboardLoading(false)
        }
    }

    const handleSavePriceItem = async (item: CreatePriceListItem & { id?: string }) => {
        await savePriceListItem({ ...item, keywords: item.keywords || [] })
        const prices = await getPriceList()
        setPriceList(prices)
        toast(item.id ? "Price item updated." : "Price item added.", "success")
    }

    const handleDeletePriceItem = (item: PriceListItem) => {
        setPriceItemToDelete(item)
    }

    const confirmDeletePriceItem = async () => {
        if (!priceItemToDelete) return

        await deletePriceListItem(priceItemToDelete.id)
        const prices = await getPriceList()
        setPriceList(prices)
        setPriceItemToDelete(null)
        toast("Price item deleted.", "success")
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
        const validation = validateAndNormalizeBusinessProfile(profile)
        if (!validation.ok) {
            toast(validation.error, "error")
            return
        }

        const normalizedProfile = validation.profile

        setSaving(true)
        try {
            // 1. Save to Supabase (Server)
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                const { error: dbError } = await supabase
                    .from("profiles")
                    .upsert({
                        id: session.user.id,
                        business_name: normalizedProfile.business_name,
                        phone: normalizedProfile.phone,
                        email: normalizedProfile.email,
                        address: normalizedProfile.address,
                        license_number: normalizedProfile.license_number,
                        tax_rate: normalizedProfile.tax_rate,
                        logo_url: normalizedProfile.logo_url,
                        state_province: normalizedProfile.state_province,
                        payment_link: normalizedProfile.payment_link,
                        estimate_template_url: normalizedProfile.estimate_template_url,
                    })

                if (dbError) throw dbError
            }

            // 2. Save to Local Storage (Client)
            saveProfile(normalizedProfile)
            setProfile(normalizedProfile)

            toast("Profile synced and saved.", "success")
            const stats = await getStorageStats()
            setStorageStats(stats)
        } catch (error: unknown) {
            console.error("Error saving profile:", error)
            toast(error instanceof Error ? `Failed to sync: ${error.message}` : "Failed to sync profile.", "error")
        } finally {
            setSaving(false)
        }
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canUsePdfBranding) {
            toast("Upgrade to Starter or above to brand PDFs with your logo.", "info")
            return
        }

        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast('Please upload an image file.', 'error')
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
                toast('Failed to upload logo.', 'error')
                setUploading(false)
            }
            reader.readAsDataURL(file)
        } catch (error) {
            console.error('Error uploading logo:', error)
            toast('Failed to upload logo.', 'error')
            setUploading(false)
        }
    }

    const handleRemoveLogo = () => {
        setProfile({ ...profile, logo_url: "" })
        setLogoPreview(null)
    }

    const handleClearData = () => {
        setClearDataConfirmOpen(true)
    }

    const confirmClearData = async () => {
        clearAllEstimates()
        setProfile({
            business_name: "",
            phone: "",
            email: "",
            address: "",
            license_number: "",
            tax_rate: 13,
            logo_url: "",
            state_province: "ON",
            payment_link: "",
            estimate_template_url: "",
        })
        setLogoPreview(null)
        setClearDataConfirmOpen(false)
        toast("All data cleared.", "success")
        const stats = await getStorageStats()
        setStorageStats(stats)
    }

    const priceListCategoryCount = useMemo(() => new Set(priceList.map((item) => item.category)).size, [priceList])

    if (!authResolved) {
        return (
            <AuthGate
                loading
                nextPath="/profile"
                title="Sign in to manage profile"
                description="Business details, price lists, PDF branding, and Stripe settings are saved to your account."
            />
        )
    }

    if (!isAuthenticated) {
        return (
            <AuthGate
                loading={false}
                nextPath="/profile"
                title="Sign in to manage profile"
                description="Business details, price lists, PDF branding, and Stripe settings are saved to your account."
            />
        )
    }

    if (loading) {
        return (
            <AuthGate
                loading
                nextPath="/profile"
                title="Loading profile"
                description="Loading business details, price list, PDF settings, and payment connection status."
                loadingLabel="Loading profile..."
            />
        )
    }

    const currentPlanTier = subscription?.planTier || "free"
    const canUsePdfBranding = hasPdfBrandingAccess(currentPlanTier)
    const canUsePdfTemplate = hasPdfTemplateAccess(currentPlanTier)
    const stripeStatusLabel = getStripeStatusLabel(stripeConnectStatus)
    const hasBusinessDetails = Boolean(profile.business_name.trim())
    const hasContactDetails = Boolean(profile.phone.trim() || profile.email.trim())
    const hasPaymentDestination = Boolean(stripeConnectStatus?.connected && stripeConnectStatus.chargesEnabled) || Boolean(profile.payment_link?.trim())
    const hasStarterPricing = priceList.length > 0
    const setupStepCount = [hasBusinessDetails, hasContactDetails, hasPaymentDestination, hasStarterPricing].filter(Boolean).length
    const setupSteps = [
        {
            label: "Business",
            description: hasBusinessDetails ? profile.business_name : "Add the company name used on PDFs.",
            status: hasBusinessDetails ? "Ready" : "Required",
            href: "#business-details",
            ready: hasBusinessDetails,
            icon: Building2,
            testId: "profile-setup-business-details",
        },
        {
            label: "Contact",
            description: hasContactDetails ? "Phone or email is available for customers." : "Add phone or email for customer-ready estimates.",
            status: hasContactDetails ? "Ready" : "Missing",
            href: "#business-details",
            ready: hasContactDetails,
            icon: Users,
            testId: "profile-setup-contact",
        },
        {
            label: "Payments",
            description: hasPaymentDestination ? "A payment destination is available." : "Connect Stripe or add a manual payment link.",
            status: hasPaymentDestination ? "Ready" : "Setup",
            href: "#stripe-connect",
            ready: hasPaymentDestination,
            icon: CreditCard,
            testId: "profile-setup-payments",
        },
        {
            label: "Prices",
            description: hasStarterPricing ? `${priceList.length} saved item${priceList.length === 1 ? "" : "s"}.` : "Add repeatable labor, service, or part prices.",
            status: hasStarterPricing ? "Ready" : "Empty",
            href: "#price-list",
            ready: hasStarterPricing,
            icon: DollarSign,
            testId: "profile-setup-price-list",
        },
    ]
    const canSaveProfile = Boolean(profile.business_name.trim())
        && Number.isFinite(Number(profile.tax_rate ?? 0))
        && Number(profile.tax_rate ?? 0) >= 0
        && Number(profile.tax_rate ?? 0) <= 100

    const handleExportBackup = async () => {
        try {
            const latestEstimates = await getEstimates()
            const backup = generateFullBackupJSON(profile, latestEstimates, priceList)
            const blob = new Blob([backup], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = `snapquote-backup-${new Date().toISOString().split("T")[0]}.json`
            link.click()
            URL.revokeObjectURL(url)
            toast("Backup exported.", "success")
        } catch (error) {
            console.error("Failed to export backup:", error)
            toast("Failed to export backup.", "error")
        }
    }

    return (
        <div className="profile-console field-app min-h-screen px-4 pb-28 pt-5">
            <div className="mx-auto max-w-5xl space-y-5">
            <section className="field-panel p-3 sm:p-5" data-testid="profile-command-center">
                <div className="space-y-3 sm:space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-white">Business Profile</h1>
                            <p className="mt-1 hidden max-w-2xl text-sm leading-6 text-slate-400 sm:block">
                                Branding, payments, and workspace setup for customer-ready estimates.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-lg border border-white/[0.15] bg-slate-950/60 px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                                {currentPlanTier}
                            </span>
                            <Button
                                className="h-10 rounded-lg"
                                onClick={handleSave}
                                disabled={saving || !canSaveProfile}
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
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                        <div className="field-mini">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">PDF</p>
                                <Sparkles className="hidden h-4 w-4 text-slate-400 sm:block" />
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 sm:mt-3 sm:text-2xl">{canUsePdfTemplate ? "Pro kit" : canUsePdfBranding ? "Starter" : "Locked"}</p>
                            <p className="mt-1 hidden text-xs text-slate-400 sm:block">
                                {canUsePdfTemplate ? "Logo and full-page template unlocked" : canUsePdfBranding ? "Logo branding unlocked" : "Upgrade to unlock branded PDFs"}
                            </p>
                        </div>
                        <div className="field-mini">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Stripe</p>
                                <CreditCard className="hidden h-4 w-4 text-slate-400 sm:block" />
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 sm:mt-3 sm:text-2xl">{stripeStatusLabel}</p>
                            <p className="mt-1 hidden text-xs text-slate-400 sm:block">
                                {stripeConnectStatus?.accountId ? stripeConnectStatus.accountId : "No company payment account linked yet"}
                            </p>
                        </div>
                        <div className="field-mini">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Prices</p>
                                <DollarSign className="hidden h-4 w-4 text-slate-400 sm:block" />
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 sm:mt-3 sm:text-2xl">{priceList.length}</p>
                            <p className="mt-1 hidden text-xs text-slate-400 sm:block">{priceListCategoryCount} active pricing categories</p>
                        </div>
                        <div className="field-mini">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 sm:text-xs sm:tracking-[0.2em]">Local</p>
                                <Database className="hidden h-4 w-4 text-slate-400 sm:block" />
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 sm:mt-3 sm:text-2xl">{storageStats.estimateCount}</p>
                            <p className="mt-1 hidden text-xs text-slate-400 sm:block">{storageStats.storageUsed} used in this browser</p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-2.5 sm:p-3" data-testid="profile-setup-guide">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">Setup path</p>
                                <p className="mt-1 text-sm font-semibold text-white">{setupStepCount}/4 quote-ready settings complete</p>
                            </div>
                            <Button
                                asChild
                                size="sm"
                                className="h-9 shrink-0 rounded-lg"
                            >
                                <a href="#business-details">Finish setup</a>
                            </Button>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:mt-3 sm:grid-cols-2 sm:gap-2 xl:grid-cols-4">
                            {setupSteps.map((step) => {
                                const Icon = step.icon

                                return (
                                    <a
                                        key={step.label}
                                        href={step.href}
                                        className="rounded-lg border border-white/10 bg-slate-900/60 p-2 transition-colors hover:border-blue-300/30 hover:bg-slate-900 sm:p-3"
                                        data-testid={step.testId}
                                    >
                                        <div className="space-y-2">
                                            <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-white sm:gap-2 sm:text-sm">
                                                <Icon className="hidden h-4 w-4 shrink-0 text-blue-200 sm:block" />
                                                <span className="truncate">{step.label}</span>
                                            </span>
                                            <span className={`inline-flex w-fit items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] sm:px-2 sm:text-[10px] sm:tracking-[0.14em] ${step.ready ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-amber-300/25 bg-amber-400/10 text-amber-200"}`}>
                                                {step.ready ? <CheckCircle2 className="h-3 w-3" /> : null}
                                                {step.status}
                                            </span>
                                        </div>
                                        <p className="mt-2 hidden text-xs leading-5 text-slate-400 sm:line-clamp-2">{step.description}</p>
                                    </a>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" data-testid="profile-workbench">
                <div className="flex min-w-0 flex-col gap-6" data-testid="profile-primary-column">
                    <Card className="field-card order-2" data-testid="pdf-branding-card">
                        <CardHeader className="p-4 pb-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-lg text-white">
                                        <Sparkles className="h-5 w-5" />
                                        PDF Branding Kit
                                    </CardTitle>
                                    <CardDescription className="text-slate-400">
                                        Make estimate PDFs look like your company, not generic software.
                                    </CardDescription>
                                </div>
                                <span className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-blue-200">
                                    {currentPlanTier}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <div className={`profile-box-strong ${canUsePdfBranding ? "border-emerald-400/25 bg-emerald-500/10" : "border-amber-400/25 bg-amber-500/10"}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">Starter Branding</p>
                                        <p className="text-xs text-slate-400">
                                            Add your company logo so the PDF header looks like your business.
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                                        {canUsePdfBranding ? "Unlocked" : "Starter+"}
                                    </span>
                                </div>
                            </div>

                            <div className={`profile-box-strong ${canUsePdfTemplate ? "border-sky-400/25 bg-sky-500/10" : "border-white/10 bg-slate-950/55"}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">Pro Template Background</p>
                                        <p className="text-xs text-slate-400">
                                            Upload a full-page estimate background for a custom branded PDF layout.
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-300">
                                        {canUsePdfTemplate ? "Unlocked" : "Pro+"}
                                    </span>
                                </div>
                            </div>

                            {!canUsePdfBranding ? (
                                <div className="profile-box text-sm">
                                    Upgrade to Starter to unlock logo branding on PDFs, or Pro to unlock a full custom background template.
                                    <div className="mt-3">
                                        <Button asChild size="sm">
                                            <Link href="/pricing?plan=starter">See PDF branding plans</Link>
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="field-card order-1 scroll-mt-24" id="business-details" data-testid="business-details-card">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                <Building2 className="h-5 w-5" />
                                Business Details
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                This information appears on estimates, PDFs, and fallback payment details.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4 pt-0">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                        <Label htmlFor="business-logo-upload">Business Logo</Label>
                        <div className="flex items-center gap-4">
                            {logoPreview ? (
                                <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                                    <Image
                                        src={logoPreview}
                                        alt="Business Logo"
                                        fill
                                        className="object-contain p-2"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-red-600/90 text-white shadow-lg transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        aria-label="Remove business logo"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-white/20 bg-slate-950/70">
                                    <Upload className="h-6 w-6 text-slate-500" />
                                </div>
                            )}
                            <div className="flex-1">
                                <Input
                                    id="business-logo-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={uploading || !canUsePdfBranding}
                                    className="cursor-pointer"
                                />
                                <p className="profile-note mt-1">
                                    {canUsePdfBranding
                                        ? "Upload your company logo (appears on PDF header)"
                                        : "Starter or above unlocks logo branding on estimate PDFs."}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Estimate Template Upload */}
                    <div className="space-y-2">
                        <Label htmlFor="estimate-template-upload">Estimate Template Background</Label>
                        <div className="flex items-center gap-4">
                            {profile.estimate_template_url ? (
                                <div className="relative h-32 w-24 overflow-hidden rounded-lg border border-blue-400/30 bg-slate-950">
                                    <Image
                                        src={profile.estimate_template_url}
                                        alt="Estimate Template"
                                        fill
                                        className="object-contain p-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setProfile({ ...profile, estimate_template_url: "" })}
                                        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-red-600/90 text-white shadow-lg transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        aria-label="Remove estimate template background"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-32 w-24 flex-col items-center justify-center rounded-lg border border-dashed border-blue-400/25 bg-slate-950/70">
                                    <Upload className="mb-1 h-5 w-5 text-blue-300/60" />
                                    <span className="text-[10px] text-blue-200/60">A4</span>
                                </div>
                            )}
                            <div className="flex-1">
                                <Input
                                    id="estimate-template-upload"
                                    type="file"
                                    accept="image/*"
                                    disabled={!canUsePdfTemplate}
                                    onChange={(e) => {
                                        if (!canUsePdfTemplate) return
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
                                <p className="profile-note mt-1">
                                    {canUsePdfTemplate
                                        ? "Upload a company estimate background image. It will render behind every PDF page."
                                        : "Upgrade to Pro or Team to upload a full-page branded PDF template."}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                    Recommended: A4-sized image. Starter unlocks logo branding. Pro unlocks the full-page background.
                                </p>
                                {!canUsePdfTemplate && (
                                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                                        <Lock className="h-3 w-3" />
                                        Pro branding kit required
                                    </div>
                                )}
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
                        {!profile.business_name.trim() ? (
                            <p className="profile-note text-amber-300">Enter a business name before saving.</p>
                        ) : null}
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
                        <p className="profile-note">
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
                            className="flex h-11 w-full rounded-lg border border-white/10 bg-slate-950/70 px-3.5 py-2 text-sm text-white shadow-none transition-[border-color,box-shadow,background-color] duration-200 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
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
                        <p className="profile-note">
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
                        <p className="profile-note">
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
                        <p className="profile-note">
                            HST/GST rate for your region (e.g., Ontario = 13%)
                        </p>
                        {!Number.isFinite(Number(profile.tax_rate ?? 0)) || Number(profile.tax_rate ?? 0) < 0 || Number(profile.tax_rate ?? 0) > 100 ? (
                            <p className="profile-note text-amber-300">Use a tax rate between 0 and 100.</p>
                        ) : null}
                    </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="min-w-0 space-y-6" data-testid="profile-operations-panel">
                    <Card className="field-card scroll-mt-24" id="stripe-connect" data-testid="stripe-connect-card">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                <CreditCard className="h-5 w-5" />
                                Stripe Connect
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Each business manages its own payments, payouts, refunds, and disputes in Stripe.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                    {stripeStatusLoading ? (
                        <p className="flex items-center gap-2 text-sm text-slate-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading Stripe status...
                        </p>
                    ) : (
                        <>
                            <div className="profile-box-strong">
                                {!stripeConnectStatus ? (
                                    <p className="text-sm text-muted-foreground">
                                        Log in to connect your company Stripe account.
                                    </p>
                                ) : stripeConnectStatus.connected && stripeConnectStatus.detailsSubmitted && stripeConnectStatus.chargesEnabled ? (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-emerald-700">Connected and ready to accept card payments.</p>
                                        {stripeConnectStatus.accountId && (
                                        <p className="font-mono text-xs text-slate-500">{stripeConnectStatus.accountId}</p>
                                        )}
                                    </div>
                                ) : stripeConnectStatus.connected ? (
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-700">Connected, but onboarding is incomplete.</p>
                                        {stripeConnectStatus.accountId && (
                                        <p className="font-mono text-xs text-slate-500">{stripeConnectStatus.accountId}</p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400">
                                        Stripe is not connected yet.
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button
                                    className="flex-1 rounded-lg"
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
                                    className="rounded-lg border-white/10 bg-slate-900/70 text-white"
                                    onClick={handleOpenStripeDashboard}
                                    disabled={stripeDashboardLoading || !stripeConnectStatus?.connected}
                                    aria-label="Open Stripe dashboard"
                                    title="Open Stripe dashboard"
                                >
                                    {stripeDashboardLoading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <ExternalLink className="h-4 w-4" />
                                    )}
                                </Button>

                                <Button
                                    variant="ghost"
                                    className="rounded-lg text-slate-300 hover:bg-white/10"
                                    onClick={loadStripeConnectStatus}
                                    disabled={stripeStatusLoading}
                                    aria-label="Refresh Stripe status"
                                    title="Refresh Stripe status"
                                >
                                    <RefreshCw className={`h-4 w-4 ${stripeStatusLoading ? "animate-spin" : ""}`} />
                                </Button>
                            </div>

                            {!stripeConnectStatus?.connected && (
                                <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                                    <p className="text-center text-xs leading-relaxed text-blue-200">
                                        Connect your bank account with Stripe, our secure payment partner, to start receiving Credit Card and Apple Pay payments directly through SnapQuote. Takes about 3 minutes.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                        </CardContent>
                    </Card>

                    <Card className="field-card">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                <Link2 className="h-5 w-5" />
                                QuickBooks Entry Point
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Invoice sync is managed from History so you can push won estimates into QuickBooks with live record context.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <div className="profile-box text-sm">
                                Open History to connect QuickBooks, review sync status, and push sent or paid estimates into your company ledger.
                            </div>
                            <Button asChild variant="outline" className="w-full rounded-lg border-white/10 bg-slate-900/70 text-white">
                                <Link href="/history">Open History & QuickBooks</Link>
                            </Button>
                        </CardContent>
                    </Card>

                    <ReferralStatusCard />

                    <Card className="field-card">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                App Language
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <LanguageSelector />
                        </CardContent>
                    </Card>

                    <Card className="field-card">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                <Users className="h-5 w-5" />
                                Team Workspace
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Team plan members can invite crew, share synced estimates, and standardize quoting across the workspace.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 p-4 pt-0">
                            <div className="profile-box text-sm">
                                Team workspace access is live. Invite members, manage crew roles, and review synced estimate activity from one shared feed.
                            </div>
                            <Button asChild variant="outline" className="w-full rounded-lg border-white/10 bg-slate-900/70 text-white">
                                <Link href="/team">Open Team Workspace</Link>
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="field-card scroll-mt-24" id="price-list" data-testid="price-list-card">
                        <CardHeader className="p-4 pb-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-5 w-5" />
                                    <CardTitle className="text-lg text-white">My Price List</CardTitle>
                                </div>
                                <Button size="sm" className="rounded-lg" onClick={handleAddPriceItem}>
                                    <Plus className="h-4 w-4 mr-1" />
                                    Add
                                </Button>
                            </div>
                            <CardDescription className="text-slate-400">
                                AI will use these fixed prices for consistent estimates.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2 p-4 pt-0">
                    {priceList.length === 0 ? (
                        <div className="profile-box py-6 text-center">
                            <DollarSign className="mx-auto mb-2 h-8 w-8 text-slate-500" />
                            <p className="text-sm font-medium text-white">No price items yet.</p>
                            <p className="text-xs text-slate-500">Add items to ensure consistent pricing.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {["PARTS", "LABOR", "SERVICE"].map(category => {
                                const items = priceList.filter(p => p.category === category)
                                if (items.length === 0) return null
                                return (
                                    <div key={category}>
                                        <p className="mb-1 text-xs font-semibold text-slate-500">{category}</p>
                                        {items.map(item => (
                                            <div key={item.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/55 p-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-3 break-words text-sm font-medium leading-5 text-white [overflow-wrap:anywhere]">{item.name}</p>
                                                    <p className="mt-0.5 line-clamp-3 break-words text-xs leading-4 text-slate-500 [overflow-wrap:anywhere]">
                                                        ${item.price}/{item.unit}
                                                        {item.keywords.length > 0 && ` • ${item.keywords.join(", ")}`}
                                                    </p>
                                                </div>
                                                <div className="ml-1 flex shrink-0 gap-1">
                                                    <Button variant="ghost" size="icon" className="rounded-lg text-slate-300 hover:bg-white/10" onClick={() => handleEditPriceItem(item)} aria-label={`Edit ${item.name}`}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="rounded-lg text-red-300 hover:bg-red-500/10" onClick={() => handleDeletePriceItem(item)} aria-label={`Delete ${item.name}`}>
                                                        <Trash2 className="h-4 w-4" />
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

                    <Card className="field-card border-dashed">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-white">
                                <Database className="h-5 w-5" />
                                Local Data
                            </CardTitle>
                            <CardDescription className="text-slate-400">
                                Export a browser backup before clearing local data or moving devices.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4 pt-0">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="profile-box">
                                    <p className="text-slate-500">Estimates Saved</p>
                                    <p className="text-lg font-bold text-white">{storageStats.estimateCount}</p>
                                </div>
                                <div className="profile-box">
                                    <p className="text-slate-500">Storage Used</p>
                                    <p className="text-lg font-bold text-white">{storageStats.storageUsed}</p>
                                </div>
                            </div>
                            <p className="profile-note">
                                All data is stored locally in your browser for offline-first quoting.
                            </p>
                            <Button variant="outline" className="w-full rounded-lg border-white/10 bg-slate-900/70 text-white" onClick={() => void handleExportBackup()}>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Export Backup JSON
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="field-card border-red-500/30">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="text-lg text-red-300">Danger Zone</CardTitle>
                            <CardDescription className="text-slate-400">
                                Clear all estimates and profile data from this browser.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <Button
                                variant="destructive"
                                className="w-full rounded-lg"
                                onClick={handleClearData}
                            >
                                Clear All Data
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
            </div>

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
            <ConfirmDialog
                open={Boolean(priceItemToDelete)}
                onClose={() => setPriceItemToDelete(null)}
                onConfirm={confirmDeletePriceItem}
                title={priceItemToDelete ? `Delete ${priceItemToDelete.name}?` : "Delete price item?"}
                description="This removes the saved price item from your local price list. Existing estimates are not changed."
            />
            <ConfirmDialog
                open={clearDataConfirmOpen}
                onClose={() => setClearDataConfirmOpen(false)}
                onConfirm={confirmClearData}
                title="Clear all local data?"
                description="This deletes estimates, profile details, and locally stored quote data from this browser. This action cannot be undone."
                confirmLabel="Clear data"
            />
        </div>
    )
}
