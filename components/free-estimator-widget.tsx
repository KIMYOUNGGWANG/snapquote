"use client"

import { useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Calculator, Check, ImagePlus } from "lucide-react"

type EstimatorState = "idle" | "uploading" | "processing" | "teaser" | "capturing" | "success"

interface TeaserData {
    subtotal: number
    tax: number
    total: number
    itemCount: number
    remaining: number
}

export function FreeEstimatorWidget() {
    const [state, setState] = useState<EstimatorState>("idle")
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [teaserData, setTeaserData] = useState<TeaserData | null>(null)
    const [email, setEmail] = useState("")
    const [errorMessage, setErrorMessage] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return

        setErrorMessage("")
        setPreviewUrl(URL.createObjectURL(file))
        setState("processing")

        try {
            const formData = new FormData()
            formData.append("file", file)

            const response = await fetch("/api/public/parse-receipt", {
                method: "POST",
                body: formData,
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || "Failed to analyze image")
            }

            const data = await response.json()
            setTeaserData({
                subtotal: data.subtotal || 0,
                tax: data.tax || 0,
                total: data.total || 0,
                itemCount: data.itemCount || 0,
                remaining: data.remaining ?? 0,
            })
            setState("teaser")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Something went wrong"
            setErrorMessage(message)
            setState("idle")
        }
    }, [])

    const handleEmailSubmit = useCallback(async (event: React.FormEvent) => {
        event.preventDefault()
        if (!email.trim()) return

        setIsSubmitting(true)
        setErrorMessage("")

        try {
            const response = await fetch("/api/public/capture-lead", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), source: "free_estimator_v1" }),
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.error || "Failed to submit")
            }

            setState("success")
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Something went wrong"
            setErrorMessage(message)
        } finally {
            setIsSubmitting(false)
        }
    }, [email])

    const handleReset = useCallback(() => {
        setState("idle")
        setPreviewUrl(null)
        setTeaserData(null)
        setEmail("")
        setErrorMessage("")
        if (fileInputRef.current) fileInputRef.current.value = ""
    }, [])

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)

    return (
        <div className="mx-auto w-full max-w-lg">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/75 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md">
                <div className="border-b border-white/10 bg-slate-950/55 p-6">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-200">
                            <Calculator className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Free Material Cost Calculator</h3>
                            <p className="text-xs text-gray-400">Upload a receipt or material list → Get instant totals</p>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {state === "idle" && (
                        <>
                        <button
                            type="button"
                            className="flex min-h-56 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-white/10 p-10 text-center transition-all duration-300 ease-in-out hover:border-blue-500/30 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                            onClick={() => fileInputRef.current?.click()}
                            aria-describedby="free-estimator-upload-help"
                        >
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-blue-500/10 text-blue-200">
                                <ImagePlus className="h-8 w-8" />
                            </div>
                            <p className="mb-1 font-semibold text-white">Drop or tap to upload</p>
                            <p className="text-xs text-gray-400">Receipt, invoice, or handwritten material list</p>
                            <p id="free-estimator-upload-help" className="mt-2 text-xs text-gray-400">JPEG, PNG, WebP · Max 10MB</p>
                        </button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileSelect}
                        />
                        </>
                    )}

                    {state === "processing" && (
                        <div className="flex flex-col items-center py-10">
                            {previewUrl && (
                                <div className="mb-6 h-24 w-24 overflow-hidden rounded-lg opacity-60">
                                    <Image src={previewUrl} alt="Uploaded" width={96} height={96} className="h-full w-full object-cover" />
                                </div>
                            )}
                            <div className="relative mb-4">
                                <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500/20 border-t-blue-500" />
                            </div>
                            <p className="font-semibold text-white">AI is analyzing your materials...</p>
                            <p className="mt-1 text-xs text-gray-400">This usually takes 5-10 seconds</p>
                        </div>
                    )}

                    {state === "teaser" && teaserData && (
                        <div>
                            <div className="mb-6 text-center">
                                <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-1.5">
                                    <Check className="h-4 w-4 text-green-400" />
                                    <span className="text-xs font-medium text-green-400">Analysis Complete</span>
                                </div>
                            </div>

                            <div className="mb-6 space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-400">Subtotal</span>
                                    <span className="font-medium text-white">{formatCurrency(teaserData.subtotal)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-400">Tax</span>
                                    <span className="font-medium text-white">{formatCurrency(teaserData.tax)}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/10 pt-3">
                                    <span className="text-lg font-bold">Total</span>
                                    <span className="text-2xl font-bold text-blue-200">
                                        {formatCurrency(teaserData.total)}
                                    </span>
                                </div>
                            </div>

                            <div className="relative mb-6">
                                <div className="pointer-events-none blur-sm">
                                    <div className="space-y-2">
                                        {Array.from({ length: Math.min(teaserData.itemCount, 5) }).map((_, index) => (
                                            <div key={index} className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                                                <div className="flex-1">
                                                    <div className="mb-1 h-3 w-3/4 rounded bg-white/10" />
                                                    <div className="h-2 w-1/2 rounded bg-white/5" />
                                                </div>
                                                <div className="h-3 w-16 rounded bg-white/10" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="rounded-lg border border-white/10 bg-[#0a0a0f]/90 px-6 py-4 text-center backdrop-blur-sm">
                                        <p className="mb-1 text-sm font-semibold text-white">
                                            {teaserData.itemCount} items found
                                        </p>
                                        <p className="text-xs text-gray-400">Enter your email to see the full breakdown</p>
                                    </div>
                                </div>
                            </div>

                            <form onSubmit={handleEmailSubmit} className="space-y-3">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white transition-all placeholder:text-gray-400 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                                />
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-all duration-300 ease-in-out hover:bg-blue-500 disabled:bg-blue-600/50"
                                >
                                    {isSubmitting ? "Sending..." : "Get Full Breakdown Free"}
                                </button>
                                <p className="text-center text-xs text-gray-400">No spam. We only send your detailed estimate.</p>
                            </form>
                        </div>
                    )}

                    {state === "success" && (
                        <div className="py-10 text-center">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
                                <Check className="h-8 w-8" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-white">You&apos;re in.</h3>
                            <p className="mb-6 text-sm text-gray-400">
                                Check <strong className="text-white">{email}</strong> for the full breakdown.
                            </p>
                            <p className="mb-6 text-sm text-gray-400">
                                Want <strong className="text-white">unlimited</strong> AI estimates with voice input, PDF generation, and auto follow-ups?
                            </p>
                            <a
                                href="/new-estimate"
                                className="inline-block rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white transition-all duration-300 ease-in-out hover:bg-blue-500"
                            >
                                Try SnapQuote Free
                            </a>
                            <button
                                onClick={handleReset}
                                className="mx-auto mt-4 block text-xs text-gray-400 transition-colors hover:text-gray-300"
                            >
                                Scan another receipt
                            </button>
                        </div>
                    )}

                    {errorMessage && (
                        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                            {errorMessage}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
