"use client"

import { Camera, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PhotoEstimateAnalysis, UpsellOption } from "@/lib/estimates-storage"
import { lineTotal } from "@/lib/estimates/math"

type DemoTutorialBannerProps = {
    onDismiss: () => void
    onStartBlank: () => void
}

export function DemoTutorialBanner({ onDismiss, onStartBlank }: DemoTutorialBannerProps) {
    return (
        <div className="field-panel p-3" data-testid="demo-tutorial-banner">
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-blue-300">First-quote tutorial</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Editable sample quote. Replace the customer and tune pricing before sharing.
                        </p>
                    </div>
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onDismiss} className="flex-1">
                        Keep Editing
                    </Button>
                    <Button size="sm" variant="outline" onClick={onStartBlank} className="flex-1 border-white/10 bg-slate-950/70 text-white hover:bg-slate-900">
                        Start Blank
                    </Button>
                </div>
            </div>
        </div>
    )
}

type PhotoEstimateAnalysisCardProps = {
    analysis: PhotoEstimateAnalysis
}

export function PhotoEstimateAnalysisCard({ analysis }: PhotoEstimateAnalysisCardProps) {
    return (
        <div className="space-y-4 rounded-lg border border-sky-300/25 bg-sky-400/10 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-sky-100">Photo Estimate Analysis</p>
                    <p className="mt-1 text-xs text-sky-100/75">
                        Pricing confidence: <span className="font-semibold uppercase">{analysis.pricingConfidence}</span>
                    </p>
                </div>
                <Camera className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" />
            </div>
            {analysis.observations.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">Observed</p>
                    <ul className="space-y-1 text-sm text-sky-50/85">
                        {analysis.observations.map((observation, index) => (
                            <li key={`observation-${index}`}>• {observation}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {analysis.suggestedScope.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">Suggested scope</p>
                    <ul className="space-y-1 text-sm text-sky-50/85">
                        {analysis.suggestedScope.map((scopeItem, index) => (
                            <li key={`scope-${index}`}>• {scopeItem}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {analysis.materialSuggestions.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">Material suggestions</p>
                    <div className="space-y-2">
                        {analysis.materialSuggestions.map((suggestion, index) => (
                            <div key={`material-${index}`} className="rounded-lg border border-sky-300/20 bg-slate-950/60 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">
                                            {suggestion.label}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-400">{suggestion.reason}</p>
                                    </div>
                                    <span className="text-xs font-semibold text-sky-100">
                                        {suggestion.quantity} {suggestion.unit}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

type UpsellOptionsCardProps = {
    onApply: (tier: "better" | "best") => void
    options: UpsellOption[]
}

export function UpsellOptionsCard({ onApply, options }: UpsellOptionsCardProps) {
    if (options.length === 0) return null

    return (
        <div className="space-y-3 rounded-lg border border-blue-400/25 bg-blue-500/10 p-3">
            <p className="text-sm font-semibold text-blue-200">
                Auto-Upsell Packages
            </p>
            <div className="space-y-3">
                {options.map((option, index) => {
                    const addedTotal = option.addedItems.reduce((sum, item) => sum + lineTotal(item), 0)
                    return (
                        <div key={`${option.tier}-${index}`} className="space-y-2 rounded-lg border border-white/10 bg-slate-950/60 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-white">
                                        {option.tier === "better" ? "Better" : "Best"}: {option.title}
                                    </p>
                                    {option.description && (
                                        <p className="mt-1 text-xs text-slate-400">{option.description}</p>
                                    )}
                                </div>
                                <p className="text-sm font-bold text-blue-200">+${addedTotal.toFixed(2)}</p>
                            </div>
                            <ul className="space-y-1">
                                {option.addedItems.map((item, itemIndex) => (
                                    <li
                                        key={`${item.id}-${itemIndex}`}
                                        className="flex justify-between gap-2 text-xs text-slate-400"
                                    >
                                        <span>{item.description}</span>
                                        <span className="font-medium text-white">+${lineTotal(item).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full border-white/10 bg-slate-950/70 text-white hover:bg-slate-900"
                                onClick={() => onApply(option.tier)}
                            >
                                <Plus className="h-3 w-3 mr-2" />
                                Add {option.tier === "better" ? "Better" : "Best"} Package
                            </Button>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
