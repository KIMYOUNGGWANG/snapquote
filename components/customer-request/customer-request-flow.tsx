"use client"

import { useRef, useState } from "react"
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, Loader2, RefreshCw, Send, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { compressImageToDataUrl } from "@/lib/image-compress"
import {
    MAX_REQUEST_PHOTOS,
    REQUEST_SPACES,
    formatRequestPrice,
    type Diagnosis,
} from "@/lib/customer-requests"
import { cn } from "@/lib/utils"

type Step = "photos" | "diagnosing" | "result" | "sending" | "sent"
type Space = (typeof REQUEST_SPACES)[number]

const URGENCY_COPY: Record<Diagnosis["urgency"], { label: string; detail: string; className: string }> = {
    low: { label: "Low urgency", detail: "Safe to schedule at a normal time.", className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" },
    medium: { label: "Medium urgency", detail: "Book a visit in the next few days.", className: "border-amber-300/25 bg-amber-400/10 text-amber-100" },
    high: { label: "High urgency", detail: "Do the safety steps below now.", className: "border-red-300/30 bg-red-500/10 text-red-100" },
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.")
    return data
}

export function CustomerRequestFlow({ slug, businessName }: { slug: string; businessName: string }) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [step, setStep] = useState<Step>("photos")
    const [photos, setPhotos] = useState<string[]>([])
    const [isAddingPhotos, setIsAddingPhotos] = useState(false)
    const [space, setSpace] = useState<Space | "">("")
    const [note, setNote] = useState("")
    const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
    const [diagnosisToken, setDiagnosisToken] = useState("")
    const [disclaimer, setDisclaimer] = useState("")
    const [priceRangeHidden, setPriceRangeHidden] = useState(false)
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [phone, setPhone] = useState("")
    const [areaLabel, setAreaLabel] = useState("")
    const [error, setError] = useState("")

    const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).slice(0, MAX_REQUEST_PHOTOS - photos.length)
        event.target.value = ""
        if (files.length === 0) return
        setError("")
        setIsAddingPhotos(true)
        const added: string[] = []
        const failed: string[] = []
        for (const file of files) {
            try {
                added.push(await compressImageToDataUrl(file))
            } catch {
                failed.push(file.name)
            }
        }
        setPhotos((current) => [...current, ...added].slice(0, MAX_REQUEST_PHOTOS))
        if (failed.length) setError(`Could not read ${failed.join(", ")}. Try a JPEG or PNG photo.`)
        setIsAddingPhotos(false)
    }

    const runDiagnosis = async () => {
        if (!space || photos.length === 0) return
        setError("")
        setStep("diagnosing")
        try {
            const data = await postJson("/api/public/diagnose", { slug, space, note: note.trim() || undefined, photos })
            setDiagnosis(data.diagnosis as Diagnosis)
            setDiagnosisToken(typeof data.diagnosisToken === "string" ? data.diagnosisToken : "")
            setDisclaimer(typeof data.disclaimer === "string" ? data.disclaimer : "")
            setPriceRangeHidden(data.priceRangeHidden === true)
            setStep("result")
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Photo check failed.")
            setStep("photos")
        }
    }

    const sendRequest = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!diagnosis || !space) return
        if (!email.trim() && !phone.trim()) {
            setError("Add an email or a phone number so we can reach you.")
            return
        }
        setError("")
        setStep("sending")
        try {
            await postJson("/api/public/requests", {
                slug,
                space,
                note: note.trim() || undefined,
                diagnosis,
                diagnosisToken,
                photos,
                name: name.trim(),
                email: email.trim(),
                phone: phone.trim(),
                areaLabel: areaLabel.trim() || undefined,
            })
            setStep("sent")
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not send your request.")
            setStep("result")
        }
    }

    if (step === "sent") {
        return (
            <section className="field-panel p-5 text-center sm:p-6" data-testid="request-sent">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-2xl font-semibold">Request sent</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-400">
                    {businessName} has your photos and the first read. They will reach out to confirm a visit and a firm price.
                </p>
            </section>
        )
    }

    if (step === "diagnosing") {
        return (
            <section className="field-panel flex flex-col items-center p-8 text-center" data-testid="request-diagnosing" aria-live="polite">
                <Loader2 className="h-8 w-8 animate-spin text-blue-200" />
                <p className="mt-4 font-semibold">Looking at your photos…</p>
                <p className="mt-1 text-sm text-slate-400">This usually takes 5 to 15 seconds.</p>
            </section>
        )
    }

    if ((step === "result" || step === "sending") && diagnosis) {
        const urgency = URGENCY_COPY[diagnosis.urgency]
        return (
            <div className="grid gap-4">
                <section className="field-panel overflow-hidden" data-testid="request-diagnosis">
                    <div className="border-b border-white/10 p-4 sm:p-5">
                        <p className="field-section-title">First read from your photos</p>
                        <p className="mt-3 text-lg font-semibold leading-7" data-testid="request-diagnosis-cause">{diagnosis.cause}</p>
                        <div className={cn("mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5", urgency.className)} data-testid="request-urgency">
                            {diagnosis.urgency === "high" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{urgency.label}</p>
                                <p className="text-sm opacity-80">{urgency.detail}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
                        <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Likely cost</p>
                            {diagnosis.priceRange && !priceRangeHidden ? (
                                <p className="mt-2 text-2xl font-semibold tabular-nums" data-testid="request-price-range">{formatRequestPrice(diagnosis.priceRange)}</p>
                            ) : (
                                <p className="mt-2 text-sm leading-6 text-slate-300">{businessName} will quote after a quick look.</p>
                            )}
                        </div>
                        <div className="rounded-lg border border-white/10 bg-slate-950/55 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Before the visit</p>
                            {diagnosis.beforeVisit.length ? (
                                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-200">
                                    {diagnosis.beforeVisit.map((item) => (
                                        <li key={item} className="flex gap-2"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-blue-200" />{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mt-2 text-sm leading-6 text-slate-300">Nothing needed. Leave the area as it is.</p>
                            )}
                        </div>
                    </div>
                    {disclaimer ? <p className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-slate-500 sm:px-5">{disclaimer}</p> : null}
                </section>

                <form className="field-panel grid gap-3 p-4 sm:p-5" onSubmit={sendRequest} data-testid="request-contact-form">
                    <div>
                        <h2 className="text-lg font-semibold">Get a quote from {businessName}</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-400">Your photos and this read go with the request.</p>
                    </div>
                    <label className="grid gap-1.5 text-sm text-slate-300">
                        Name
                        <Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="h-11 rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm text-slate-300">
                            Email
                            <Input type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="h-11 rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500" />
                        </label>
                        <label className="grid gap-1.5 text-sm text-slate-300">
                            Phone
                            <Input type="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" className="h-11 rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500" />
                        </label>
                    </div>
                    <label className="grid gap-1.5 text-sm text-slate-300">
                        Neighbourhood
                        <Input maxLength={120} value={areaLabel} onChange={(event) => setAreaLabel(event.target.value)} placeholder="e.g. Hyde Park" className="h-11 rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500" />
                        <span className="text-xs text-slate-500">Just the area for now. Share the exact address once you book.</span>
                    </label>
                    {error ? <p role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm leading-6 text-red-100">{error}</p> : null}
                    <Button type="submit" disabled={step === "sending"} className="h-12 rounded-lg text-base" data-testid="request-send">
                        {step === "sending" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                        {step === "sending" ? "Sending…" : "Send quote request"}
                    </Button>
                </form>
            </div>
        )
    }

    const canDiagnose = photos.length > 0 && Boolean(space) && !isAddingPhotos
    return (
        <section className="field-panel grid gap-5 p-4 sm:p-5" data-testid="request-photo-step">
            <div>
                <p className="field-section-title">Step 1 of 2</p>
                <h2 className="mt-2 text-lg font-semibold">Show us the problem</h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">Up to {MAX_REQUEST_PHOTOS} photos. One close-up and one wider shot work best.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                    <div key={index} className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-slate-950">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                        <img src={photo} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                            type="button"
                            onClick={() => setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}
                            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/80 text-slate-200 transition-colors hover:bg-slate-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                            aria-label={`Remove photo ${index + 1}`}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ))}
                {photos.length < MAX_REQUEST_PHOTOS ? (
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAddingPhotos}
                        className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/15 text-xs font-semibold text-slate-300 transition-colors hover:border-blue-300/40 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-60"
                        data-testid="request-add-photo"
                    >
                        {isAddingPhotos ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6 text-blue-200" />}
                        {photos.length === 0 ? "Add photo" : "Add another"}
                    </button>
                ) : null}
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} data-testid="request-photo-input" />
            </div>

            <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm text-slate-300">Where is it?</legend>
                <div className="flex flex-wrap gap-2">
                    {REQUEST_SPACES.map((option) => (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={space === option}
                            onClick={() => setSpace(option)}
                            className={cn(
                                "min-h-11 rounded-lg border px-3 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300",
                                space === option
                                    ? "border-blue-300/60 bg-blue-500/20 text-white"
                                    : "border-white/10 bg-slate-950/60 text-slate-300 hover:bg-slate-900 hover:text-white",
                            )}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </fieldset>

            <label className="grid gap-1.5 text-sm text-slate-300">
                <span className="flex items-baseline gap-2">What is happening? <span className="text-xs text-slate-500">Optional</span></span>
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="e.g. Dripping under the sink since yesterday" className="min-h-[84px] resize-none rounded-lg border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500" />
            </label>

            {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm leading-6 text-red-100">
                    <RefreshCw className="mt-1 h-4 w-4 shrink-0" />
                    {error}
                </div>
            ) : null}

            <Button type="button" onClick={runDiagnosis} disabled={!canDiagnose} className="h-12 rounded-lg text-base" data-testid="request-diagnose">
                <ClipboardList className="mr-2 h-4 w-4" />
                Check my photos
            </Button>
        </section>
    )
}
