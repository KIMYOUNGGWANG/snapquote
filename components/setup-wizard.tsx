"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/toast"
import { Loader2, CreditCard, ArrowRight, CheckCircle2 } from "lucide-react"
import { getProfile, saveProfile } from "@/lib/estimates-storage"

const TOTAL_STEPS = 3

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [connectLoading, setConnectLoading] = useState(false)
    const [businessName, setBusinessName] = useState("")
    const [taxRate, setTaxRate] = useState("0")

    useEffect(() => {
        // Fetch existing data if any
        const fetchProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) return

            const { data } = await supabase
                .from("profiles")
                .select("business_name, default_tax_rate")
                .eq("id", session.user.id)
                .single()

            if (data?.business_name) setBusinessName(data.business_name)
            if (data?.default_tax_rate !== null && data?.default_tax_rate !== undefined) setTaxRate(data.default_tax_rate.toString())
        }
        void fetchProfile()
    }, [])

    const handleNext = () => setStep(step + 1)
    const handleBack = () => setStep(step - 1)

    const handleSaveProfile = async () => {
        setLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) throw new Error("No session")

            const { error } = await supabase
                .from("profiles")
                .update({
                    business_name: businessName,
                    default_tax_rate: parseFloat(taxRate) || 0
                })
                .eq("id", session.user.id)

            if (error) throw error

            // Sync to localStorage so Profile and New Estimate pages pick it up
            const existing = getProfile()
            saveProfile({
                business_name: businessName,
                phone: existing?.phone || "",
                email: existing?.email || session.user.email || "",
                address: existing?.address || "",
                license_number: existing?.license_number || "",
                tax_rate: parseFloat(taxRate) || 0,
                logo_url: existing?.logo_url || "",
                state_province: existing?.state_province || "ON",
            })

            handleNext()
        } catch (error: any) {
            toast(error.message, "error")
        } finally {
            setLoading(false)
        }
    }

    const handleConnectStripe = async () => {
        setConnectLoading(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
                router.push("/login?next=/new-estimate&intent=payment-link")
                return
            }
            const response = await fetch("/api/stripe/connect/onboard", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
            })
            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || "Failed to start Stripe Connect setup")
            }
            const { url } = await response.json()
            if (url) window.location.href = url
        } catch (error: any) {
            toast(error.message, "error")
        } finally {
            setConnectLoading(false)
        }
    }

    const handleSkipStripe = () => {
        toast("Setup complete! You can connect Stripe later from your profile.", "success")
        onComplete()
    }

    const handleFinish = () => {
        toast("Setup complete! Your business profile is ready.", "success")
        onComplete()
    }

    const StepIndicator = () => (
        <div className="flex items-center justify-center gap-2 mb-2">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                        i + 1 <= step ? "bg-primary w-8" : "bg-muted w-4"
                    }`}
                />
            ))}
        </div>
    )

    if (step === 1) {
        return (
            <Card className="w-full max-w-md mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <StepIndicator />
                    <CardTitle>Welcome to SnapQuote! 🎉</CardTitle>
                    <CardDescription>Let&apos;s set up your business profile in 3 quick steps.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Business Name <span className="text-red-500">*</span></label>
                        <Input
                            placeholder="e.g. John's Plumbing Services"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">This will appear on the quotes you send to clients.</p>
                    </div>
                </CardContent>
                <CardFooter>
                    <Button onClick={handleNext} disabled={!businessName.trim()} className="w-full">
                        Next Step
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    if (step === 2) {
        return (
            <Card className="w-full max-w-md mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <StepIndicator />
                    <CardTitle>Step 2: Default Tax Rate</CardTitle>
                    <CardDescription>You can always change this later per-estimate.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tax Rate (%)</label>
                        <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 5.5"
                            value={taxRate}
                            onChange={(e) => setTaxRate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Used as the default tax percentage for new quotes.</p>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                    <Button variant="outline" onClick={handleBack} disabled={loading} className="w-1/3">
                        Back
                    </Button>
                    <Button onClick={handleSaveProfile} disabled={loading} className="w-2/3">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Next Step
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    // Step 3: Stripe Connect
    return (
        <Card className="w-full max-w-md mx-auto mt-8 border-primary/20 shadow-lg">
            <CardHeader>
                <StepIndicator />
                <CardTitle>Step 3: Accept Payments</CardTitle>
                <CardDescription>
                    Connect Stripe to collect payments directly from your estimates — before you drive off the job.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Add &quot;Pay Now&quot; to every estimate PDF</p>
                            <p className="text-xs text-muted-foreground">Clients tap and pay — you get notified instantly.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Deposit & full-payment links</p>
                            <p className="text-xs text-muted-foreground">Collect 50% upfront before starting a job.</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-medium">Payouts directly to your bank</p>
                            <p className="text-xs text-muted-foreground">Stripe handles compliance. You handle the work.</p>
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
                    Connect Stripe — Accept Payments
                </Button>
                <Button variant="ghost" onClick={handleSkipStripe} className="w-full text-muted-foreground">
                    Skip for now — I&apos;ll do this later
                </Button>
                <Button variant="ghost" size="sm" onClick={handleBack} className="w-full">
                    Back
                </Button>
            </CardFooter>
        </Card>
    )
}
