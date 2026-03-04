"use client"

import { useState, useRef, useCallback } from "react"
import Image from "next/image"

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
        <div className="w-full max-w-lg mx-auto">
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 p-6 border-b border-white/5">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">Free Material Cost Calculator</h3>
                            <p className="text-xs text-gray-400">Upload a receipt or material list → Get instant totals</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* IDLE: Upload */}
                    {state === "idle" && (
                        <div
                            className="border-2 border-dashed border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/[0.03] hover:border-blue-500/30 transition-all duration-300 ease-in-out hover:scale-[1.01]"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="font-semibold text-white mb-1">Drop or tap to upload</p>
                            <p className="text-xs text-gray-500">Receipt, invoice, or handwritten material list</p>
                            <p className="text-xs text-gray-600 mt-2">JPEG, PNG, WebP · Max 10MB</p>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileSelect}
                            />
                        </div>
                    )}

                    {/* PROCESSING: Loading */}
                    {state === "processing" && (
                        <div className="flex flex-col items-center py-10">
                            {previewUrl && (
                                <div className="w-24 h-24 rounded-xl overflow-hidden mb-6 opacity-60">
                                    <Image src={previewUrl} alt="Uploaded" width={96} height={96} className="object-cover w-full h-full" />
                                </div>
                            )}
                            <div className="relative mb-4">
                                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                            </div>
                            <p className="font-semibold text-white">AI is analyzing your materials...</p>
                            <p className="text-xs text-gray-500 mt-1">This usually takes 5-10 seconds</p>
                        </div>
                    )}

                    {/* TEASER: Show totals, hide items */}
                    {state === "teaser" && teaserData && (
                        <div>
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-4">
                                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-xs text-green-400 font-medium">Analysis Complete</span>
                                </div>
                            </div>

                            {/* Visible totals */}
                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Subtotal</span>
                                    <span className="text-white font-medium">{formatCurrency(teaserData.subtotal)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Tax</span>
                                    <span className="text-white font-medium">{formatCurrency(teaserData.tax)}</span>
                                </div>
                                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                                    <span className="font-bold text-lg">Total</span>
                                    <span className="font-bold text-2xl bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                        {formatCurrency(teaserData.total)}
                                    </span>
                                </div>
                            </div>

                            {/* Blurred items teaser */}
                            <div className="relative mb-6">
                                <div className="blur-sm pointer-events-none">
                                    <div className="space-y-2">
                                        {Array.from({ length: Math.min(teaserData.itemCount, 5) }).map((_, index) => (
                                            <div key={index} className="flex justify-between items-center bg-white/5 rounded-lg p-3 text-sm">
                                                <div className="flex-1">
                                                    <div className="h-3 bg-white/10 rounded w-3/4 mb-1" />
                                                    <div className="h-2 bg-white/5 rounded w-1/2" />
                                                </div>
                                                <div className="h-3 bg-white/10 rounded w-16" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="bg-[#0a0a0f]/90 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-4 text-center">
                                        <p className="text-sm font-semibold text-white mb-1">
                                            🔒 {teaserData.itemCount} items found
                                        </p>
                                        <p className="text-xs text-gray-400">Enter your email to see the full breakdown</p>
                                    </div>
                                </div>
                            </div>

                            {/* Email capture form */}
                            <form onSubmit={handleEmailSubmit} className="space-y-3">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    placeholder="your@email.com"
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white py-3 rounded-xl font-semibold text-sm transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/25"
                                >
                                    {isSubmitting ? "Sending..." : "📩 Get Full Breakdown — Free"}
                                </button>
                                <p className="text-center text-xs text-gray-600">No spam. We only send your detailed estimate.</p>
                            </form>
                        </div>
                    )}

                    {/* SUCCESS */}
                    {state === "success" && (
                        <div className="text-center py-10">
                            <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="font-bold text-xl text-white mb-2">You&apos;re in! 🎉</h3>
                            <p className="text-sm text-gray-400 mb-6">
                                Check <strong className="text-white">{email}</strong> for the full breakdown.
                            </p>
                            <p className="text-sm text-gray-400 mb-6">
                                Want <strong className="text-white">unlimited</strong> AI estimates with voice input, PDF generation, and auto follow-ups?
                            </p>
                            <a
                                href="/new-estimate"
                                className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/25"
                            >
                                Try SnapQuote Free →
                            </a>
                            <button
                                onClick={handleReset}
                                className="block mx-auto mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                            >
                                Scan another receipt
                            </button>
                        </div>
                    )}

                    {/* Error */}
                    {errorMessage && (
                        <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                            {errorMessage}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
