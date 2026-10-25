export type CompletionPromptItem = {
    readonly itemId: string
    readonly description: string
}

export function buildCompletionSystemPrompt(photoCount: number): string {
    return [
        "You help a tradesperson document finished work for a customer.",
        `You receive ${photoCount} completion photo(s), numbered 0 to ${photoCount - 1} in the order given, and the line items of the quote.`,
        "Match each line item to the photos that show that work. Use only what is visible in the photos. If you are not sure a photo shows the item, set confidence to \"low\". Skip items that no photo shows.",
        "Also write a summary of the completed work: 1 to 3 plain sentences, no prices, no promises beyond what the photos show.",
        "Respond with JSON only, in exactly this shape:",
        "{\"summary\": string, \"items\": [{\"itemId\": string, \"photoIndexes\": number[], \"confidence\": \"high\" | \"low\"}]}",
        "Use itemId values exactly as given. photoIndexes are 0-based photo numbers.",
    ].join("\n")
}

export function buildCompletionUserNotes(items: readonly CompletionPromptItem[], note?: string): string {
    const lines = items.map((item) => `- ${item.itemId}: ${item.description}`)
    const parts = [`Line items:\n${lines.join("\n")}`]
    if (note?.trim()) {
        parts.push(`Technician note:\n${note.trim()}`)
    }
    return parts.join("\n\n")
}
