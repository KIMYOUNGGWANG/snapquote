"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Camera, Check, Copy, ExternalLink, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/toast"
import { normalizePublicSlugInput } from "@/lib/customer-requests"
import { supabase } from "@/lib/supabase"

type LoadState = "loading" | "ready" | "unavailable" | "signed-out"

/**
 * The contractor's public request link (/r/{slug}) and the price-range switch.
 * Saved apart from the business profile so a taken slug or a not-yet-migrated DB never blocks the main profile save.
 */
export function RequestLinkCard() {
    const [state, setState] = useState<LoadState>("loading")
    const [userId, setUserId] = useState("")
    const [savedSlug, setSavedSlug] = useState<string | null>(null)
    const [slugInput, setSlugInput] = useState("")
    const [hidePriceRange, setHidePriceRange] = useState(false)
    const [savedHidePriceRange, setSavedHidePriceRange] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        let cancelled = false
        void (async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.user) {
                if (!cancelled) setState("signed-out")
                return
            }
            const { data, error: loadError } = await supabase
                .from("profiles")
                .select("public_slug, request_hide_price_range")
                .eq("id", session.user.id)
                .maybeSingle()
            if (cancelled) return
            if (loadError) {
                console.warn("Request link settings unavailable:", loadError)
                setState("unavailable")
                return
            }
            const slug = typeof data?.public_slug === "string" ? data.public_slug : null
            setUserId(session.user.id)
            setSavedSlug(slug)
            setSlugInput(slug || "")
            setHidePriceRange(data?.request_hide_price_range === true)
            setSavedHidePriceRange(data?.request_hide_price_range === true)
            setState("ready")
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const normalized = normalizePublicSlugInput(slugInput)
    const isDirty = (normalized.ok ? normalized.slug : slugInput) !== savedSlug || hidePriceRange !== savedHidePriceRange
    const linkUrl = savedSlug && typeof window !== "undefined" ? `${window.location.origin}/r/${savedSlug}` : ""

    const handleSave = async () => {
        if (!normalized.ok) {
            setError(normalized.error)
            return
        }
        setError("")
        setSaving(true)
        const { error: saveError } = await supabase
            .from("profiles")
            .update({ public_slug: normalized.slug, request_hide_price_range: hidePriceRange })
            .eq("id", userId)
        setSaving(false)
        if (saveError) {
            setError(saveError.code === "23505" ? "That link is already taken. Try another one." : "Could not save. Please try again.")
            return
        }
        setSavedSlug(normalized.slug)
        setSlugInput(normalized.slug || "")
        setSavedHidePriceRange(hidePriceRange)
        toast(normalized.slug ? "Request link saved." : "Request link turned off.", "success")
    }

    const handleCopy = async () => {
        if (!linkUrl) return
        try {
            await navigator.clipboard.writeText(linkUrl)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
        } catch {
            toast("Could not copy. Select the link and copy it.", "error")
        }
    }

    if (state === "signed-out") return null

    return (
        <Card className="field-card scroll-mt-24" id="request-link" data-testid="request-link-card">
            <CardHeader className="p-4 pb-3">
                <CardTitle className="flex items-center gap-2 text-lg text-white">
                    <Camera className="h-5 w-5" />
                    Customer Request Link
                </CardTitle>
                <CardDescription className="text-slate-400">
                    Homeowners send a photo, see a first AI read, and request a quote. Requests land in History.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-0">
                {state === "loading" ? (
                    <p className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading request link...
                    </p>
                ) : state === "unavailable" ? (
                    <p className="profile-box text-sm">Request links are not switched on for this workspace yet.</p>
                ) : (
                    <>
                        <label className="grid gap-1.5 text-sm">
                            Your link name
                            <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-slate-950/80 focus-within:ring-2 focus-within:ring-ring">
                                <span className="shrink-0 pl-3 text-sm text-slate-500">/r/</span>
                                <Input
                                    value={slugInput}
                                    onChange={(event) => {
                                        setSlugInput(event.target.value)
                                        setError("")
                                    }}
                                    placeholder="joes-plumbing"
                                    maxLength={40}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    className="h-11 border-0 bg-transparent pl-1 text-white focus-visible:ring-0 focus-visible:ring-offset-0"
                                    data-testid="request-link-slug"
                                />
                            </div>
                            <span className="text-xs text-slate-500">Lowercase letters, numbers and hyphens. Leave empty to turn the link off.</span>
                        </label>

                        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
                            <div>
                                <p className="text-sm font-semibold text-white">Hide the price range</p>
                                <p className="text-xs leading-5 text-slate-400">Customers still see the cause and urgency.</p>
                            </div>
                            <Switch checked={hidePriceRange} onCheckedChange={setHidePriceRange} aria-label="Hide the price range from customers" />
                        </div>

                        {error ? <p role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}

                        <Button onClick={handleSave} disabled={saving || !isDirty} className="w-full rounded-lg" data-testid="request-link-save">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save request link
                        </Button>

                        {linkUrl ? (
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                                <p className="truncate rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-200" data-testid="request-link-url">{linkUrl}</p>
                                <Button type="button" variant="outline" onClick={handleCopy} className="rounded-lg border-white/10 bg-slate-900/70 text-white">
                                    {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                                    {copied ? "Copied" : "Copy link"}
                                </Button>
                                <Button asChild variant="outline" className="rounded-lg border-white/10 bg-slate-900/70 text-white">
                                    <Link href={`/r/${savedSlug}`} target="_blank" rel="noreferrer">
                                        <ExternalLink className="mr-2 h-4 w-4" />
                                        Preview
                                    </Link>
                                </Button>
                            </div>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
