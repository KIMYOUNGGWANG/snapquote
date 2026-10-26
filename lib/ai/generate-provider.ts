const GENERATE_PROVIDER = process.env.GENERATE_AI_PROVIDER?.trim().toLowerCase() || "auto"

export function resolveGenerateProvider(): "openai" | "gemini" {
    if (GENERATE_PROVIDER === "openai") {
        return "openai"
    }

    if (GENERATE_PROVIDER === "gemini") {
        return "gemini"
    }

    return process.env.GEMINI_API_KEY?.trim() ? "gemini" : "openai"
}
