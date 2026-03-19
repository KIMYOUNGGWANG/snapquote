"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/toast"
import { Loader2, CreditCard, ArrowRight, CheckCircle2, Upload, X, BadgeDollarSign, Package, ImagePlus } from "lucide-react"
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

    const canSaveStarterItem = useMemo(() => {
        if (!starterItemName.trim() && !starterItemPrice.trim()) return true
        return starterItemName.trim().length > 0 && starterItemPrice.trim().length > 0 && !Number.isNaN(Number(starterItemPrice))
    }, [starterItemName, starterItemPrice])

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
        } catch (error: any) {
            toast(error.message || "Failed to save business profile.", "error")
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
        } catch (error: any) {
            toast(error.message || "Failed to set up your starter price list.", "error")
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
        } catch (error: any) {
            toast(error.message || "Failed to connect Stripe.", "error")
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
        <div className="flex items-center justify-center gap-2 mb-2">
            {Array.from({ length: TOTAL_STEPS }, (_, index) => (
                <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                        index + 1 <= step ? "bg-primary w-8" : "bg-muted w-4"
                    }`}
                />
            ))}
        </div>
    )

    if (step === 1) {
        return (
            <Card className="w-full max-w-xl mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <StepIndicator />
                    <CardTitle>Set up your field quote profile</CardTitle>
                    <CardDescription>Start with the name and tax rate you want on every first draft.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Business Name <span className="text-red-500">*</span></label>
                        <Input
                            placeholder="e.g. North Shore Plumbing"
                            value={businessName}
                            onChange={(event) => setBusinessName(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">This shows on PDFs, payment links, and customer emails.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Default Tax Rate (%)</label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 5"
                            value={taxRate}
                            onChange={(event) => setTaxRate(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">You can override tax per quote later.</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleNext} disabled={!businessName.trim()} className="w-full">
                        Add Logo
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    if (step === 2) {
        return (
            <Card className="w-full max-w-xl mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <StepIndicator />
                    <CardTitle>Brand the quote</CardTitle>
                    <CardDescription>Add a logo now so your very first PDF already looks like your business.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                            {logoPreview ? (
                                <div className="relative h-24 w-24 overflow-hidden rounded-xl border bg-background">
                                    <Image src={logoPreview} alt="Business logo preview" fill className="object-contain p-2" />
                                    <button
                                        type="button"
                                        onClick={() => setLogoPreview(null)}
                                        className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed bg-background">
                                    <ImagePlus className="h-6 w-6 text-muted-foreground" />
                                </div>
                            )}
                            <div className="flex-1 space-y-2">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    disabled={loading}
                                    className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground">PNG or JPG is enough. We store it locally for PDFs.</p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <p className="text-sm font-medium">Why this matters</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Quotes with your own brand look finished even when the draft started from voice notes in the truck.
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={handleBack} disabled={loading} className="w-1/3">
                        Back
                    </Button>
                    <Button onClick={handleSaveBusinessProfile} disabled={loading || !businessName.trim()} className="w-2/3">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                        Price List Setup
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    if (step === 3) {
        return (
            <Card className="w-full max-w-xl mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <StepIndicator />
                    <CardTitle>Seed your price list</CardTitle>
                    <CardDescription>Choose a trade starter pack and add one line item you quote all the time.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium">Current local items</p>
                                <p className="text-xs text-muted-foreground">We keep existing items and only add missing starters.</p>
                            </div>
                            <div className="rounded-full bg-background px-3 py-1 text-sm font-semibold">
                                {existingPriceCount} items
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="text-sm font-medium">Pick your closest trade</p>
                        <div className="grid grid-cols-2 gap-3">
                            {TRADE_PRESETS.map((trade) => {
                                const isSelected = selectedTrade === trade.id
                                return (
                                    <button
                                        key={trade.id}
                                        type="button"
                                        onClick={() => setSelectedTrade(trade.id)}
                                        className={`rounded-xl border p-3 text-left transition-colors ${
                                            isSelected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"
                                        }`}
                                    >
                                        <p className="text-sm font-semibold">{trade.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{trade.description}</p>
                                        <p className="mt-2 text-[11px] text-muted-foreground">{trade.initialItems.length} starter items</p>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">Optional: add one custom starter item</p>
                        </div>
                        <Input
                            placeholder="e.g. Emergency call-out"
                            value={starterItemName}
                            onChange={(event) => setStarterItemName(event.target.value)}
                        />
                        <div className="grid grid-cols-3 gap-2">
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="Price"
                                value={starterItemPrice}
                                onChange={(event) => setStarterItemPrice(event.target.value)}
                            />
                            <select
                                value={starterItemUnit}
                                onChange={(event) => setStarterItemUnit(event.target.value as PriceUnit)}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {STARTER_UNITS.map((unit) => (
                                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                                ))}
                            </select>
                            <select
                                value={starterItemCategory}
                                onChange={(event) => setStarterItemCategory(event.target.value as PriceCategory)}
                                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {STARTER_CATEGORIES.map((category) => (
                                    <option key={category.value} value={category.value}>{category.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={handleBack} disabled={loading} className="w-1/3">
                        Back
                    </Button>
                    <Button onClick={handleApplyPriceListSetup} disabled={loading} className="w-2/3">
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-2 h-4 w-4" />}
                        Save and Continue
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-xl mx-auto mt-8 border-primary/20 shadow-lg">
            <CardHeader>
                <StepIndicator />
                <CardTitle>Accept payments and load your first quote</CardTitle>
                <CardDescription>Finish now, or jump straight into a demo quote you can edit and send as practice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Stripe can wait, but it is ready</p>
                            <p className="text-xs text-muted-foreground">Connect now if you want deposit and card-payment links on estimates.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Demo quote opens fully editable</p>
                            <p className="text-xs text-muted-foreground">Change line items, client details, totals, then save or send it like a real job.</p>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                <Button onClick={handleConnectStripe} disabled={connectLoading} className="w-full">
                    {connectLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                        <CreditCard className="h-4 w-4 mr-2" />
                    )}
                    Connect Stripe
                </Button>
                <Button variant="secondary" onClick={handleLoadDemoQuote} className="w-full">
                    Load Demo Quote
                </Button>
                <Button variant="ghost" onClick={handleFinish} className="w-full text-muted-foreground">
                    Finish and return home
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBack} className="w-full">
                    Back
                </Button>
            </CardFooter>
        </Card>
    )
}
