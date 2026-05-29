"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Mic, Zap, Send, X, ArrowRight, ChevronLeft, ChevronRight, Check, Hammer, Droplets, HardHat, Thermometer, Sparkles } from "lucide-react"
import { TRADE_PRESETS, TradeType } from "@/lib/trade-presets"
import { savePriceListItem } from "@/lib/db"
import { getProfile, saveProfile, BusinessInfo } from "@/lib/estimates-storage"
import { cn } from "@/lib/utils"

interface OnboardingModalProps {
    open: boolean
    onClose: () => void
    onComplete: () => void
}

const STEPS = [
    {
        id: "trade-select",
        icon: HardHat,
        iconBg: "bg-indigo-500",
        title: "Select Your Trade",
        description: "We'll customize the app with materials and terms for your specific trade.",
        example: "",
        isTradeSelection: true
    },
    {
        id: "speak",
        icon: Mic,
        iconBg: "bg-blue-500",
        title: "Speak Your Job",
        description: "Just describe the work into your microphone. AI will understand and organize it.",
        example: '"Bathroom renovation, 50 sqft tile, toilet replacement, 4 hours labor"',
    },
    {
        id: "ai",
        icon: Zap,
        iconBg: "bg-amber-500",
        title: "AI Creates Your Estimate",
        description: "In 30 seconds, get a professional estimate with Parts, Labor, and Service itemized.",
        example: "Parts: $450 | Labor: $320 | Tax: $100 | Total: $870",
    },
    {
        id: "send",
        icon: Send,
        iconBg: "bg-green-500",
        title: "Send PDF Instantly",
        description: "Email a professional PDF estimate to your client with one tap.",
        example: "Professional estimate with your logo, sent instantly",
        showTerms: true,
    },
]

export function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [isAnimating, setIsAnimating] = useState(false)
    const [termsAccepted, setTermsAccepted] = useState(false)
    const [selectedTrade, setSelectedTrade] = useState<TradeType | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Reset when modal opens
    useEffect(() => {
        if (open) {
            setCurrentStep(0)
            setTermsAccepted(false)
            setSelectedTrade(null)
        }
    }, [open])

    if (!open) return null

    const handleNext = async () => {
        if (isAnimating) return

        // If completing trade selection, save it
        if (STEPS[currentStep].isTradeSelection && selectedTrade) {
            setIsSaving(true)
            await applyTradePreset(selectedTrade)
            setIsSaving(false)
        }

        if (currentStep < STEPS.length - 1) {
            setIsAnimating(true)
            setCurrentStep(currentStep + 1)
            setTimeout(() => setIsAnimating(false), 300)
        } else {
            // Save terms acceptance
            localStorage.setItem("snapquote_terms_accepted", "true")
            onComplete()
        }
    }

    const applyTradePreset = async (trade: TradeType) => {
        // 1. Save to profile
        // Get existing profile to preserve other fields if any (though usually empty at this stage)
        const currentProfile = getProfile() || {
            business_name: "My Business",
            phone: "",
            email: "",
            address: "",
            license_number: ""
        }

        saveProfile({
            ...currentProfile,
            tradeType: trade
        })

        // 2. Inject Price List items
        const preset = TRADE_PRESETS.find(p => p.id === trade)
        if (preset) {
            for (const item of preset.initialItems) {
                await savePriceListItem(item)
            }
        }
    }

    const handlePrev = () => {
        if (isAnimating || currentStep === 0) return

        setIsAnimating(true)
        setCurrentStep(currentStep - 1)
        setTimeout(() => setIsAnimating(false), 300)
    }

    const handleSkip = () => {
        onClose()
    }

    const step = STEPS[currentStep]
    const StepIcon = step.icon
    const isLastStep = currentStep === STEPS.length - 1

    // Validation logic
    let canProceed = true
    if (step.isTradeSelection && !selectedTrade) canProceed = false
    if (isLastStep && !termsAccepted) canProceed = false

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="field-panel flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
                    <span className="text-sm text-slate-400">
                        {currentStep + 1} / {STEPS.length}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleSkip} className="rounded-lg text-slate-400 hover:bg-white/10 hover:text-white">
                        Skip <X className="h-4 w-4 ml-1" />
                    </Button>
                </div>

                {/* Content - Scrollable */}
                <div className="overflow-y-auto p-6">
                    <div
                        className={`flex flex-col items-center text-center transition-opacity duration-300 ${isAnimating ? "opacity-0" : "opacity-100"
                            }`}
                    >
                        {/* Icon */}
                        <div className={cn("mb-6 shrink-0 rounded-lg p-4 shadow-[0_18px_32px_-24px_rgba(37,99,235,0.9)]", step.iconBg)}>
                            <StepIcon className="h-8 w-8 text-white" />
                        </div>

                        {/* Title */}
                        <h2 className="mb-3 text-xl font-semibold text-white">
                            {step.title}
                        </h2>

                        {/* Description */}
                        <p className="mb-4 text-sm leading-6 text-slate-400">
                            {step.description}
                        </p>

                        {/* Trade Selection Grid */}
                        {step.isTradeSelection && (
                            <div className="mb-4 grid w-full grid-cols-2 gap-3">
                                {TRADE_PRESETS.map((trade) => {
                                    // Dynamic icon based on trade preset (mapping strings to components if needed, or using lucide)
                                    // Simple mapping for this demo since we imported specific icons
                                    const IconInfo = trade.icon === 'Droplets' ? Droplets :
                                        trade.icon === 'Zap' ? Zap :
                                            trade.icon === 'Thermometer' ? Thermometer :
                                                trade.icon === 'Hammer' ? Hammer : HardHat

                                    const isSelected = selectedTrade === trade.id

                                    return (
                                        <button
                                            key={trade.id}
                                            onClick={() => setSelectedTrade(trade.id)}
                                            className={cn(
                                                "flex flex-col items-center rounded-lg border p-3 text-slate-200 transition-colors",
                                                isSelected
                                                    ? "border-blue-400/40 bg-blue-500/10 ring-1 ring-blue-400/20"
                                                    : "border-white/10 bg-slate-950/55 hover:border-white/20 hover:bg-slate-900"
                                            )}
                                        >
                                            <div className={`p-2 rounded-full mb-2 ${trade.color} text-white`}>
                                                <IconInfo className="h-5 w-5" />
                                            </div>
                                            <span className="text-xs font-medium">{trade.name}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        {/* Example Box (Non-Trade Steps) */}
                        {!step.isTradeSelection && step.example && (
                            <div className="mb-4 w-full rounded-lg border border-white/10 bg-slate-950/55 p-3">
                                <p className="text-xs italic text-slate-400">
                                    {step.example}
                                </p>
                            </div>
                        )}

                        {/* Terms Checkbox - Only on last step */}
                        {step.showTerms && (
                            <div className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-slate-950/55 p-3 text-left">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={termsAccepted}
                                    onClick={() => setTermsAccepted(!termsAccepted)}
                                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left text-sm text-slate-200 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
                                >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${termsAccepted
                                        ? "border-blue-500 bg-blue-600"
                                        : "border-slate-500"
                                        }`}>
                                        {termsAccepted && <Check className="h-3 w-3 text-white" />}
                                    </span>
                                    <span>I agree to the Terms of Service</span>
                                </button>
                                <Link href="/terms" target="_blank" rel="noreferrer" className="shrink-0 rounded text-sm font-medium text-blue-200 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                                    View
                                </Link>
                            </div>
                        )}
                    </div>
                </div>

                {/* Progress Dots */}
                <div className="flex shrink-0 justify-center gap-2 pb-4">
                    {STEPS.map((_, index) => (
                        <button
                            type="button"
                            key={index}
                            onClick={() => !isAnimating && index < currentStep && setCurrentStep(index)}
                            aria-label={`Go to onboarding step ${index + 1}`}
                            className={`h-2 rounded-full transition-all ${index === currentStep
                                ? "w-6 bg-blue-500"
                                : "w-2 bg-slate-700 hover:bg-slate-500"
                                }`}
                        />
                    ))}
                </div>

                {/* Navigation */}
                <div className="flex shrink-0 gap-2 border-t border-white/10 bg-slate-950/55 p-4">
                    <Button
                        variant="outline"
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className="flex-1 rounded-lg border-white/10 bg-slate-950/60 text-slate-200 hover:bg-slate-900 hover:text-white"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back
                    </Button>
                    <Button
                        onClick={handleNext}
                        disabled={!canProceed || isSaving}
                        className="flex-1 rounded-lg"
                    >
                        {isSaving ? "Setting up..." : isLastStep ? (
                            <>
                                Try Practice Estimate
                                <Sparkles className="h-4 w-4 ml-2 fill-white" />
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
