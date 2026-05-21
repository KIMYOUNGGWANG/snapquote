"use client"

import { Camera, Plus, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { PhotoEstimateAnalysis, UpsellOption } from "@/lib/estimates-storage"
import { lineTotal } from "@/lib/estimates/math"

type DemoTutorialBannerProps = {
    onDismiss: () => void
    onStartBlank: () => void
}

export function DemoTutorialBanner({ onDismiss, onStartBlank }: DemoTutorialBannerProps) {
    return (
        <Card className="border-blue-500/30 bg-blue-500/5" data-testid="demo-tutorial-banner">
            <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-blue-300">First-quote tutorial</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            This sample stays fully editable. Replace the customer, tune the pricing, then save or send it.
                        </p>
                    </div>
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground">
                    <p>1. Update the scope and totals to match the real job.</p>
                    <p>2. Replace the demo customer details before sharing.</p>
                    <p>3. Use Save, PDF, Email, or SMS once the draft is ready.</p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" onClick={onDismiss} className="flex-1">
                        Keep Editing
                    </Button>
                    <Button size="sm" variant="outline" onClick={onStartBlank} className="flex-1">
                        Start Blank
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

type PhotoEstimateAnalysisCardProps = {
    analysis: PhotoEstimateAnalysis
}

export function PhotoEstimateAnalysisCard({ analysis }: PhotoEstimateAnalysisCardProps) {
    return (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold text-sky-900">Photo Estimate Analysis</p>
                    <p className="mt-1 text-xs text-sky-800">
                        Pricing confidence: <span className="font-semibold uppercase">{analysis.pricingConfidence}</span>
                    </p>
                </div>
                <Camera className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            </div>
            {analysis.observations.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">Observed</p>
                    <ul className="space-y-1 text-sm text-sky-950">
                        {analysis.observations.map((observation, index) => (
                            <li key={`observation-${index}`}>• {observation}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {analysis.suggestedScope.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">Suggested scope</p>
                    <ul className="space-y-1 text-sm text-sky-950">
                        {analysis.suggestedScope.map((scopeItem, index) => (
                            <li key={`scope-${index}`}>• {scopeItem}</li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {analysis.materialSuggestions.length > 0 ? (
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-900">Material suggestions</p>
                    <div className="space-y-2">
                        {analysis.materialSuggestions.map((suggestion, index) => (
                            <div key={`material-${index}`} className="rounded-xl border border-sky-200 bg-white/80 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-slate-950">
                                            {suggestion.label}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">{suggestion.reason}</p>
                                    </div>
                                    <span className="text-xs font-semibold text-sky-900">
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
        <div className="space-y-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm font-semibold text-primary">
                ✨ Auto-Upsell Packages
            </p>
            <div className="space-y-3">
                {options.map((option, index) => {
                    const addedTotal = option.addedItems.reduce((sum, item) => sum + lineTotal(item), 0)
                    return (
                        <div key={`${option.tier}-${index}`} className="rounded-md border bg-background p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold">
                                        {option.tier === "better" ? "Better" : "Best"}: {option.title}
                                    </p>
                                    {option.description && (
                                        <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                                    )}
                                </div>
                                <p className="text-sm font-bold text-primary">+${addedTotal.toFixed(2)}</p>
                            </div>
                            <ul className="space-y-1">
                                {option.addedItems.map((item, itemIndex) => (
                                    <li
                                        key={`${item.id}-${itemIndex}`}
                                        className="text-xs text-muted-foreground flex justify-between gap-2"
                                    >
                                        <span>{item.description}</span>
                                        <span className="font-medium text-foreground">+${lineTotal(item).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
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
