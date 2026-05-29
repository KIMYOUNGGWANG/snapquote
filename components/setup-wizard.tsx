"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/toast"
import { ArrowRight, BadgeDollarSign, CheckCircle2, ClipboardList, CreditCard, ImagePlus, Loader2, Package, PlayCircle, X } from "lucide-react"
import { getProfile, saveProfile } from "@/lib/estimates-storage"
import { getPriceList, savePriceListItem } from "@/lib/db"
import { TRADE_PRESETS, type TradeType } from "@/lib/trade-presets"
import { queueDemoEstimateForComposer } from "@/lib/demo-estimate"
import type { PriceCategory, PriceUnit } from "@/types"

const TOTAL_STEPS = 4

const STARTER_UNITS: Array<{ value: PriceUnit; label: string }> = [
    { value: "each", label: "Each" },
    { value: "hour", label: "Hour" },
    { value: "sqft", label: "Sq Ft" },
    { value: "linear_ft", label: "Linear Ft" },
    { value: "LS", label: "Lump Sum" },
]

const STARTER_CATEGORIES: Array<{ value: PriceCategory; label: string }> = [
    { value: "PARTS", label: "Parts" },
    { value: "LABOR", label: "Labor" },
    { value: "SERVICE", label: "Service" },
]

function SetupReadinessCard({ businessName }: { businessName: string }) {
    const hasBusinessName = businessName.trim().length > 0

    return (
        <div
            className="rounded-lg border border-white/10 bg-slate-950/55 p-4"
            data-testid="setup-first-quote-readiness"
        >
            <div className="mb-3 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-300/20 bg-blue-500/10 text-blue-200">
                    <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-sm font-semibold text-white">First quote readiness</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">Get the PDF identity right now; pricing and payments can follow.</p>
                </div>
            </div>
            <div className="grid gap-2">
                <div className={`rounded-md border px-3 py-2 ${hasBusinessName ? "border-emerald-300/25 bg-emerald-400/10" : "border-amber-300/25 bg-amber-400/10"}`}>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-400">Business name</p>
                        <p className="text-sm font-semibold text-white">{hasBusinessName ? "Ready" : "Needs setup"}</p>
                    </div>
                </div>
                <div className="rounded-md border border-blue-300/20 bg-blue-400/10 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-400">Starter pricing</p>
                        <p className="text-sm font-semibold text-white">Next step</p>
                    </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-400">Payment links</p>
                        <p className="text-sm font-semibold text-white">Can wait</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

function formatStarterPrice(price: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price)
}

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [connectLoading, setConnectLoading] = useState(false)
    const [businessName, setBusinessName] = useState("")
    const [taxRate, setTaxRate] = useState("0")
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [selectedTrade, setSelectedTrade] = useState<TradeType | null>(null)
    const [existingPriceCount, setExistingPriceCount] = useState(0)
    const [starterItemName, setStarterItemName] = useState("")
    const [starterItemPrice, setStarterItemPrice] = useState("")
    const [starterItemUnit, setStarterItemUnit] = useState<PriceUnit>("each")
    const [starterItemCategory, setStarterItemCategory] = useState<PriceCategory>("SERVICE")

    useEffect(() => {
        const fetchProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) return

            const [{ data }, existingItems] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("business_name, default_tax_rate, logo_url")
                    .eq("id", session.user.id)
                    .single(),
                getPriceList(),
            ])

            if (data?.business_name) setBusinessName(data.business_name)
            if (data?.default_tax_rate !== null && data?.default_tax_rate !== undefined) {
                setTaxRate(data.default_tax_rate.toString())
            }
            if (data?.logo_url) setLogoPreview(data.logo_url)

            const localProfile = getProfile()
            if (!data?.logo_url && localProfile?.logo_url) {
                setLogoPreview(localProfile.logo_url)
            }
            if (!data?.business_name && localProfile?.business_name) {
                setBusinessName(localProfile.business_name)
            }
            if (!data?.default_tax_rate && localProfile?.tax_rate) {
                setTaxRate(localProfile.tax_rate.toString())
            }
            if (localProfile?.tradeType) {
                setSelectedTrade(localProfile.tradeType as TradeType)
            }

            setExistingPriceCount(existingItems.length)
        }

        void fetchProfile()
    }, [])

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    }, [step])

    const canSaveStarterItem = useMemo(() => {
        if (!starterItemName.trim() && !starterItemPrice.trim()) return true
        return starterItemName.trim().length > 0 && starterItemPrice.trim().length > 0 && !Number.isNaN(Number(starterItemPrice))
    }, [starterItemName, starterItemPrice])
    const selectedPreset = useMemo(
        () => TRADE_PRESETS.find((item) => item.id === selectedTrade) ?? null,
        [selectedTrade],
    )

    const handleNext = () => setStep((current) => Math.min(TOTAL_STEPS, current + 1))
    const handleBack = () => setStep((current) => Math.max(1, current - 1))

    const syncLocalProfile = (overrides: {
        business_name?: string
        tax_rate?: number
        logo_url?: string
        tradeType?: TradeType | null
    }) => {
        const existing = getProfile()
        saveProfile({
            business_name: overrides.business_name ?? existing?.business_name ?? "",
            phone: existing?.phone || "",
            email: existing?.email || "",
            address: existing?.address || "",
            license_number: existing?.license_number || "",
            tax_rate: overrides.tax_rate ?? existing?.tax_rate ?? 0,
            logo_url: overrides.logo_url ?? (existing?.logo_url || ""),
            state_province: existing?.state_province || "ON",
            tradeType: overrides.tradeType ?? existing?.tradeType,
            payment_link: existing?.payment_link || "",
        })
    }

    const handleSaveBusinessProfile = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) throw new Error("No session")

            const numericTaxRate = parseFloat(taxRate) || 0
            const { error } = await supabase
                .from("profiles")
                .update({
                    business_name: businessName.trim(),
                    default_tax_rate: numericTaxRate,
                    logo_url: logoPreview || null,
                })
                .eq("id", session.user.id)

            if (error) throw error

            syncLocalProfile({
                business_name: businessName.trim(),
                tax_rate: numericTaxRate,
                logo_url: logoPreview || "",
            })

            handleNext()
        } catch (error) {
            toast(getErrorMessage(error, "Failed to save business profile."), "error")
        } finally {
            setLoading(false)
        }
    }

    const handleApplyPriceListSetup = async () => {
        if (!canSaveStarterItem) {
            toast("Add both a starter item name and price, or leave both blank.", "error")
            return
        }

        setLoading(true)
        try {
            const existingItems = await getPriceList()
            const existingNames = new Set(existingItems.map((item) => item.name.trim().toLowerCase()))
            let addedCount = 0

            if (selectedTrade) {
                const preset = TRADE_PRESETS.find((item) => item.id === selectedTrade)
                if (preset) {
                    for (const item of preset.initialItems) {
                        const normalizedName = item.name.trim().toLowerCase()
                        if (existingNames.has(normalizedName)) continue
                        await savePriceListItem(item)
                        existingNames.add(normalizedName)
                        addedCount += 1
                    }
                }
            }

            if (starterItemName.trim() && starterItemPrice.trim()) {
                const normalizedName = starterItemName.trim().toLowerCase()
                if (!existingNames.has(normalizedName)) {
                    await savePriceListItem({
                        name: starterItemName.trim(),
                        price: Number(starterItemPrice),
                        unit: starterItemUnit,
                        category: starterItemCategory,
                        keywords: starterItemName
                            .split(" ")
                            .map((part) => part.trim().toLowerCase())
                            .filter(Boolean),
                    })
                    addedCount += 1
                }
            }

            syncLocalProfile({ tradeType: selectedTrade })

            const updatedItems = await getPriceList()
            setExistingPriceCount(updatedItems.length)
            toast(
                addedCount > 0
                    ? `Saved ${addedCount} starter price item${addedCount > 1 ? "s" : ""}.`
                    : "Price list setup saved. Existing items were kept.",
                "success",
            )
            handleNext()
        } catch (error) {
            toast(getErrorMessage(error, "Failed to set up your starter price list."), "error")
        } finally {
            setLoading(false)
        }
    }

    const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        if (!file.type.startsWith("image/")) {
            toast("Please upload an image file.", "error")
            return
        }

        setLoading(true)
        const reader = new FileReader()
        reader.onloadend = () => {
            const base64 = reader.result as string
            setLogoPreview(base64)
            setLoading(false)
        }
        reader.onerror = () => {
            setLoading(false)
            toast("Failed to load your logo.", "error")
        }
        reader.readAsDataURL(file)
    }

    const handleConnectStripe = async () => {
        setConnectLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                window.location.href = "/login?next=/new-estimate&intent=payment-link"
                return
            }

            const response = await fetch("/api/stripe/connect/onboard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(data.error || "Failed to start Stripe Connect setup")
            }

            if (typeof data.url !== "string" || !data.url) {
                throw new Error("Stripe onboarding URL is missing.")
            }

            window.location.href = data.url
        } catch (error) {
            toast(getErrorMessage(error, "Failed to connect Stripe."), "error")
        } finally {
            setConnectLoading(false)
        }
    }

    const handleFinish = () => {
        toast("Setup complete. Your business profile is ready.", "success")
        onComplete()
    }

    const handleLoadDemoQuote = () => {
        queueDemoEstimateForComposer()
        toast("Demo quote loaded. Edit it before sending.", "success")
        onComplete()
        router.push("/new-estimate?tutorial=1")
    }

    const StepIndicator = () => (
        <div className="mb-2 flex items-center justify-center gap-2">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
                <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                        index + 1 <= step ? "w-8 bg-blue-500" : "w-4 bg-slate-800"
                    }`}
                />
            ))}
        </div>
    )

    if (step === 1) {
        return (
            <Card className="field-panel mx-auto mt-4 w-full max-w-xl overflow-hidden sm:mt-8" data-testid="setup-wizard-step-1">
                <CardHeader className="border-b border-white/10 bg-slate-950/60 p-5">
                    <StepIndicator />
                    <CardTitle className="text-white">Set up your field quote profile</CardTitle>
                    <CardDescription className="text-slate-400">Start with the name and tax rate you want on every first draft.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                    <SetupReadinessCard businessName={businessName} />
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-200">Business Name <span className="text-red-300">*</span></label>
                        <Input
                            data-testid="setup-business-name-input"
                            placeholder="e.g. North Shore Plumbing"
                            value={businessName}
                            onChange={(event) => setBusinessName(event.target.value)}
                            className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                        />
                        <p className="text-xs text-slate-500">This shows on PDFs, payment links, and customer emails.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-200">Default Tax Rate (%)</label>
                        <Input
                            data-testid="setup-tax-rate-input"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 5"
                            value={taxRate}
                            onChange={(event) => setTaxRate(event.target.value)}
                            className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                        />
                        <p className="text-xs text-slate-500">You can override tax per quote later.</p>
                    </div>
                </CardContent>
                <CardFooter className="grid grid-cols-2 gap-2 p-5 pt-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleLoadDemoQuote}
                        className="rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                        data-testid="setup-demo-quote-action"
                    >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Practice quote
                    </Button>
                    <Button onClick={handleNext} disabled={!businessName.trim()} className="rounded-lg" data-testid="setup-continue-action">
                        <span className="sm:hidden">Continue</span>
                        <span className="hidden sm:inline">Continue to logo</span>
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    if (step === 2) {
        return (
            <Card className="field-panel mx-auto mt-4 w-full max-w-xl overflow-hidden sm:mt-8" data-testid="setup-wizard-step-2">
                <CardHeader className="border-b border-white/10 bg-slate-950/60 p-5">
                    <StepIndicator />
                    <CardTitle className="text-white">Brand the quote</CardTitle>
                    <CardDescription className="text-slate-400">Add a logo now so your very first PDF already looks like your business.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                    <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            {logoPreview ? (
                                <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                                    <Image src={logoPreview} alt="Business logo preview" fill className="object-contain p-2" />
                                    <button
                                        type="button"
                                        onClick={() => setLogoPreview(null)}
                                        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-red-600/90 text-white shadow-lg transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        aria-label="Remove business logo preview"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-white/15 bg-slate-950">
                                    <ImagePlus className="h-6 w-6 text-slate-500" />
                                </div>
                            )}
                            <div className="flex-1 space-y-2">
                                <label htmlFor="setup-business-logo-upload" className="text-sm font-medium text-white">
                                    Business logo
                                </label>
                                <Input
                                    id="setup-business-logo-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={loading}
                                    className="cursor-pointer rounded-lg border-white/10 bg-slate-950 text-white file:text-slate-200"
                                />
                                <p className="text-xs text-slate-500">PNG or JPG is enough. We store it locally for PDFs.</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
                        <p className="text-sm font-medium text-white">Logo is optional for the first quote</p>
                        <p className="mt-1 text-xs text-slate-400">
                            Save the business name now. You can come back to the logo after the customer sees the estimate.
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2 p-5 pt-0">
                    <Button variant="outline" onClick={handleBack} disabled={loading} className="w-1/3 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900">
                        Back
                    </Button>
                    <Button onClick={handleSaveBusinessProfile} disabled={loading || !businessName.trim()} className="w-2/3 rounded-lg" data-testid="setup-save-profile-action">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                        <span className="sm:hidden">Continue</span>
                        <span className="hidden sm:inline">Save profile and continue</span>
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    if (step === 3) {
        return (
            <Card className="field-panel mx-auto mt-4 w-full max-w-xl overflow-hidden sm:mt-8" data-testid="setup-wizard-step-3">
                <CardHeader className="border-b border-white/10 bg-slate-950/60 p-5">
                    <StepIndicator />
                    <CardTitle className="text-white">Seed your price list</CardTitle>
                    <CardDescription className="text-slate-400">Choose a trade starter pack and add one line item you quote all the time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-white">Current local items</p>
                                <p className="text-xs text-slate-400">We keep existing items and only add missing starters.</p>
                            </div>
                            <div className="rounded-full border border-white/10 bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
                                {existingPriceCount} items
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-medium text-white">Pick your closest trade</p>
                        <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            {TRADE_PRESETS.map((trade) => {
                                const isSelected = selectedTrade === trade.id
                                return (
                                    <button
                                        key={trade.id}
                                        type="button"
                                        onClick={() => setSelectedTrade(trade.id)}
                                        data-testid={`setup-trade-${trade.id}`}
                                        className={`min-h-[116px] rounded-lg border p-3 text-left transition-colors ${
                                            isSelected ? "border-blue-400/45 bg-blue-500/15" : "border-white/10 bg-slate-950/70 hover:border-blue-300/35"
                                        }`}
                                    >
                                        <p className="text-sm font-semibold text-white">{trade.name}</p>
                                        <p className="mt-1 text-xs text-slate-400">{trade.description}</p>
                                        <p className="mt-2 text-[11px] text-slate-500">{trade.initialItems.length} starter items</p>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4" data-testid="setup-starter-preview">
                        {selectedPreset ? (
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-white">{selectedPreset.name} starter pack</p>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {selectedPreset.initialItems.length} common quote items will be ready offline.
                                        </p>
                                    </div>
                                    <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                                        Selected
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    {selectedPreset.initialItems.slice(0, 3).map((item) => (
                                        <div key={item.name} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-900/70 px-3 py-2">
                                            <p className="min-w-0 truncate text-xs text-slate-300">{item.name}</p>
                                            <p className="shrink-0 text-xs font-semibold text-white">
                                                {formatStarterPrice(item.price)} / {item.unit}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3">
                                <BadgeDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                                <div>
                                    <p className="text-sm font-semibold text-white">Starter preview appears here</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">
                                        Pick a trade to see which repeat items SnapQuote will add before your first real estimate.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-4">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-blue-300" />
                            <p className="text-sm font-medium text-white">Optional: add one custom starter item</p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                            <Input
                                placeholder="e.g. Emergency call-out"
                                value={starterItemName}
                                onChange={(event) => setStarterItemName(event.target.value)}
                                className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                                data-testid="setup-starter-item-name"
                            />
                            <Input
                                aria-label="Starter item price"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Price"
                                value={starterItemPrice}
                                onChange={(event) => setStarterItemPrice(event.target.value)}
                                className="rounded-lg border-white/10 bg-slate-950 text-white placeholder:text-slate-500"
                                data-testid="setup-starter-item-price"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                aria-label="Starter item unit"
                                value={starterItemUnit}
                                onChange={(event) => setStarterItemUnit(event.target.value as PriceUnit)}
                                className="h-11 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                                data-testid="setup-starter-item-unit"
                            >
                                {STARTER_UNITS.map((unit) => (
                                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                                ))}
                            </select>
                            <select
                                aria-label="Starter item category"
                                value={starterItemCategory}
                                onChange={(event) => setStarterItemCategory(event.target.value as PriceCategory)}
                                className="h-11 rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
                                data-testid="setup-starter-item-category"
                            >
                                {STARTER_CATEGORIES.map((category) => (
                                    <option key={category.value} value={category.value}>{category.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2 p-5 pt-0">
                    <Button variant="outline" onClick={handleBack} disabled={loading} className="w-1/3 rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900">
                        Back
                    </Button>
                    <Button onClick={handleApplyPriceListSetup} disabled={loading} className="w-2/3 rounded-lg" data-testid="setup-save-starter-kit-action">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-2 h-4 w-4" />}
                        <span className="sm:hidden">Save kit</span>
                        <span className="hidden sm:inline">Save starter kit</span>
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className="field-panel mx-auto mt-4 w-full max-w-xl overflow-hidden sm:mt-8" data-testid="setup-wizard-step-4">
            <CardHeader className="border-b border-white/10 bg-slate-950/60 p-5">
                <StepIndicator />
                <CardTitle className="text-white">Open your first quote</CardTitle>
                <CardDescription className="text-slate-400">You have enough setup to practice the full estimate flow. Payments can wait.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
                <div className="space-y-3 rounded-lg border border-blue-400/20 bg-blue-500/10 p-4">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                        <div>
                            <p className="text-sm font-medium text-white">Practice quote is the best next step</p>
                            <p className="text-xs text-slate-400">Review the editable estimate, PDF identity, line items, and send flow before a live job.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
                        <div>
                            <p className="text-sm font-medium text-white">Stripe stays one tap away</p>
                            <p className="text-xs text-slate-400">Connect only when you are ready to collect deposits and card payments from estimates.</p>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="grid gap-2 p-5 pt-0 sm:grid-cols-2">
                <Button onClick={handleLoadDemoQuote} className="w-full rounded-lg sm:col-span-2" data-testid="setup-final-demo-action">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Open practice quote
                </Button>
                <Button
                    variant="outline"
                    onClick={handleConnectStripe}
                    disabled={connectLoading}
                    className="w-full rounded-lg border-white/10 bg-slate-950 text-slate-100 hover:bg-slate-900"
                    data-testid="setup-final-stripe-action"
                >
                    {connectLoading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <CreditCard className="mr-2 h-4 w-4" />
                    )}
                    Stripe
                </Button>
                <Button variant="ghost" onClick={handleFinish} className="w-full rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" data-testid="setup-final-home-action">
                    Finish home
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBack} className="w-full rounded-lg text-slate-400 hover:bg-white/10 hover:text-white sm:col-span-2">
                    Back
                </Button>
            </CardFooter>
        </Card>
    )
}
