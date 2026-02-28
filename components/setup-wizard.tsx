"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/toast"
import { Loader2 } from "lucide-react"
import { getProfile, saveProfile } from "@/lib/estimates-storage"

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
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

    const handleSave = async () => {
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

            toast("Setup complete! Your business profile is ready.", "success")
            onComplete()
        } catch (error: any) {
            toast(error.message, "error")
        } finally {
            setLoading(false)
        }
    }

    if (step === 1) {
        return (
            <Card className="w-full max-w-md mx-auto mt-8 border-primary/20 shadow-lg">
                <CardHeader>
                    <CardTitle>Welcome to SnapQuote! 🎉</CardTitle>
                    <CardDescription>Let&apos;s set up your business profile in 2 quick steps.</CardDescription>
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
                    </Button>
                </CardFooter>
            </Card>
        )
    }

    return (
        <Card className="w-full max-w-md mx-auto mt-8 border-primary/20 shadow-lg">
            <CardHeader>
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
                <Button onClick={handleSave} disabled={loading} className="w-2/3">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Complete Setup
                </Button>
            </CardFooter>
        </Card>
    )
}
