export type GeminiContentErrorReason = "blocked" | "empty"

export class GeminiContentError extends Error {
    readonly reason: GeminiContentErrorReason

    constructor(reason: GeminiContentErrorReason, message: string) {
        super(message)
        this.name = "GeminiContentError"
        this.reason = reason
        Object.setPrototypeOf(this, GeminiContentError.prototype)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object"
}

function readPromptBlockReason(payload: unknown): string {
    if (!isRecord(payload)) return ""
    const promptFeedback = payload.promptFeedback
    if (!isRecord(promptFeedback)) return ""
    const blockReason = promptFeedback.blockReason
    return typeof blockReason === "string" ? blockReason.trim() : ""
}

function readGeminiParts(payload: unknown): readonly unknown[] {
    if (!isRecord(payload)) return []
    const candidates = payload.candidates
    if (!Array.isArray(candidates)) return []

    const firstCandidate = candidates[0]
    if (!isRecord(firstCandidate)) return []
    const content = firstCandidate.content
    if (!isRecord(content)) return []
    const parts = content.parts
    return Array.isArray(parts) ? parts : []
}

export function extractGeminiText(payload: unknown): string {
    const parts = readGeminiParts(payload)
    for (const part of parts) {
        if (!isRecord(part)) continue
        const text = part.text
        if (typeof text !== "string") continue
        const trimmed = text.trim()
        if (trimmed) return trimmed
    }

    return ""
}

export function requireGeminiText(payload: unknown): string {
    const text = extractGeminiText(payload)
    if (text) return text

    const blockReason = readPromptBlockReason(payload)
    if (blockReason) {
        throw new GeminiContentError(
            "blocked",
            `Gemini blocked the request: ${blockReason}`
        )
    }

    throw new GeminiContentError("empty", "Gemini returned empty content")
}
