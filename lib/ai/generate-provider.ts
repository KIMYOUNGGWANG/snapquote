const GENERATE_PROVIDER = process.env.GENERATE_AI_PROVIDER?.trim().toLowerCase() || "auto"

// USD per 1M tokens [input, output], from the OpenAI and Gemini pricing pages (checked 2026-11-01).
const AI_PRICES_PER_MILLION_TOKENS: Record<string, readonly [number, number]> = {
    "gpt-4o": [2.5, 10],
    "gpt-4o-mini": [0.15, 0.6],
    "gemini-2.5-flash": [0.3, 2.5],
}

// ponytail: unknown models are priced as gpt-4o; add the model here when switching via env.
const FALLBACK_AI_PRICE = AI_PRICES_PER_MILLION_TOKENS["gpt-4o"]

export function estimateAiCostUsd(model: string | undefined, promptTokens: number, completionTokens: number): number {
    const [inputPrice, outputPrice] = (model && AI_PRICES_PER_MILLION_TOKENS[model]) || FALLBACK_AI_PRICE
    return (promptTokens * inputPrice + completionTokens * outputPrice) / 1_000_000
}

export function resolveGenerateProvider(): "openai" | "gemini" {
    if (GENERATE_PROVIDER === "openai") {
        return "openai"
    }

    if (GENERATE_PROVIDER === "gemini") {
        return "gemini"
    }

    return process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai"
}
