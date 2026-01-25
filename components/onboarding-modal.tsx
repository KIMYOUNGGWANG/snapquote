"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, Zap, Send, X, ArrowRight, ChevronLeft, ChevronRight, Check, Hammer, Droplets, HardHat, Thermometer } from "lucide-react"
import { TRADE_PRESETS, TradeType } from "@/lib/trade-presets"
import { savePriceListItem } from "@/lib/db"
import { getProfile, saveProfile, BusinessInfo } from "@/lib/estimates-storage"

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <Card className="w-full max-w-sm overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b shrink-0">
                    <span className="text-sm text-muted-foreground">
                        {currentStep + 1} / {STEPS.length}
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                        Skip <X className="h-4 w-4 ml-1" />
                    </Button>
                </div>

                {/* Content - Scrollable */}
                <CardContent className="p-6 overflow-y-auto">
                    <div
                        className={`flex flex-col items-center text-center transition-opacity duration-300 ${isAnimating ? "opacity-0" : "opacity-100"
                            }`}
                    >
                        {/* Icon */}
                        <div className={`p-4 rounded-full ${step.iconBg} mb-6 shrink-0`}>
                            <StepIcon className="h-8 w-8 text-white" />
                        </div>

                        {/* Title */}
                        <h2 className="text-xl font-bold text-foreground mb-3">
                            {step.title}
                        </h2>

                        {/* Description */}
                        <p className="text-sm text-muted-foreground mb-4">
                            {step.description}
                        </p>

                        {/* Trade Selection Grid */}
                        {step.isTradeSelection && (
                            <div className="grid grid-cols-2 gap-3 w-full mb-4">
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
                                            className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${isSelected
                                                    ? "border-primary bg-primary/10"
                                                    : "border-muted hover:border-primary/50"
                                                }`}
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
                            <div className="w-full bg-muted/50 rounded-lg p-3 border border-border mb-4">
                                <p className="text-xs text-muted-foreground italic">
                                    {step.example}
                                </p>
                            </div>
                        )}

                        {/* Terms Checkbox - Only on last step */}
                        {step.showTerms && (
                            <button
                                onClick={() => setTermsAccepted(!termsAccepted)}
                                className="flex items-center gap-3 w-full p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
                            >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${termsAccepted
                                    ? "bg-primary border-primary"
                                    : "border-muted-foreground/50"
                                    }`}>
                                    {termsAccepted && <Check className="h-3 w-3 text-primary-foreground" />}
                                </div>
                                <span className="text-sm text-foreground">
                                    I agree to the{" "}
                                    <a
                                        href="#"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-primary underline"
                                    >
                                        Terms of Service
                                    </a>
                                </span>
                            </button>
                        )}
                    </div>
                </CardContent>

                {/* Progress Dots */}
                <div className="flex justify-center gap-2 pb-4 shrink-0">
                    {STEPS.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => !isAnimating && index < currentStep && setCurrentStep(index)}
                            className={`w-2 h-2 rounded-full transition-all ${index === currentStep
                                ? "bg-primary w-6"
                                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                                }`}
                        />
                    ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-2 p-4 border-t bg-muted/30 shrink-0">
                    <Button
                        variant="outline"
                        onClick={handlePrev}
                        disabled={currentStep === 0}
                        className="flex-1"
                    >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back
                    </Button>
                    <Button
                        onClick={handleNext}
                        disabled={!canProceed || isSaving}
                        className="flex-1"
                    >
                        {isSaving ? "Setting up..." : isLastStep ? (
                            <>
                                Get Started
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </>
                        ) : (
                            <>
                                Next
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </>
                        )}
                    </Button>
                </div>
            </Card>
        </div>
    )
}
