export type JsonContentParseErrorReason = "empty"

export type ParsePotentialJsonContentOptions = {
    readonly emptyMessage?: string
}

export class JsonContentParseError extends Error {
    readonly reason: JsonContentParseErrorReason

    constructor(reason: JsonContentParseErrorReason, message: string) {
        super(message)
        this.name = "JsonContentParseError"
        this.reason = reason
        Object.setPrototypeOf(this, JsonContentParseError.prototype)
    }
}

const DEFAULT_EMPTY_JSON_CONTENT_MESSAGE = "AI response is empty"

export function parsePotentialJsonContent(
    input: string,
    options: ParsePotentialJsonContentOptions = {}
): unknown {
    const trimmed = input.trim()
    if (!trimmed) {
        throw new JsonContentParseError(
            "empty",
            options.emptyMessage || DEFAULT_EMPTY_JSON_CONTENT_MESSAGE
        )
    }

    try {
        return JSON.parse(trimmed)
    } catch {
        const unwrapped = trimmed
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim()
        return JSON.parse(unwrapped)
    }
}
