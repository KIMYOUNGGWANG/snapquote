"use client"

import { cn } from "@/lib/utils"

type EstimateStep = "input" | "transcribing" | "verifying" | "generating" | "result"

interface EstimateProgressStepperProps {
    currentStep: EstimateStep
}

const STEPS: Array<Exclude<EstimateStep, "input">> = [
    "transcribing",
    "verifying",
    "generating",
    "result",
]

const STEP_LABELS: Record<Exclude<EstimateStep, "input">, string> = {
    transcribing: "🎙 분석 중",
    verifying: "✏️ 확인",
    generating: "⚡ 생성 중",
    result: "✅ 완료",
}

export function EstimateProgressStepper({
    currentStep,
}: EstimateProgressStepperProps): JSX.Element | null {
    if (currentStep === "input") return null

    const currentIndex = STEPS.indexOf(currentStep)

    return (
        <div className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
            <nav
                aria-label="Estimate progress"
                className="overflow-x-auto px-4 py-3"
            >
                <ol className="flex min-w-max items-center gap-2 text-xs font-medium sm:justify-center sm:text-sm">
                    {STEPS.map((step, index) => {
                        const isCurrent = step === currentStep
                        const isCompleted = index < currentIndex

                        return (
                            <li key={step} className="flex items-center gap-2">
                                <span
                                    className={cn(
                                        "inline-flex items-center rounded-full px-3 py-1.5 transition-colors",
                                        isCurrent && "bg-blue-600 text-white shadow-sm shadow-blue-600/20",
                                        isCompleted && "text-blue-600",
                                        !isCurrent && !isCompleted && "text-muted-foreground"
                                    )}
                                >
                                    {isCompleted ? `✓ ${STEP_LABELS[step]}` : STEP_LABELS[step]}
                                </span>
                                {index < STEPS.length - 1 ? (
                                    <span aria-hidden="true" className="text-muted-foreground/60">
                                        ›
                                    </span>
                                ) : null}
                            </li>
                        )
                    })}
                </ol>
            </nav>
        </div>
    )
}
