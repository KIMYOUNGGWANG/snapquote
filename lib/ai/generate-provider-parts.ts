export type OpenAiGenerateUserContentPart =
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "image_url"; readonly image_url: { readonly url: string } }

export type GeminiGenerateContentPart =
    | { readonly text: string }
    | { readonly inlineData: { readonly mimeType: string; readonly data: string } }

type GenerateUserPartsInput = {
    readonly notes?: string
    readonly images?: readonly string[]
}

function parseBase64ImageDataUrl(raw: string): { readonly mimeType: string; readonly data: string } | null {
    const trimmed = raw.trim()
    const match = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i.exec(trimmed)
    if (!match) return null

    const mimeType = match[1]?.trim().toLowerCase() || ""
    const data = (match[2] || "").replace(/\s+/g, "")

    if (!mimeType.startsWith("image/")) return null
    if (!data) return null

    return {
        mimeType,
        data,
    }
}

export function buildOpenAiGenerateUserContent(
    input: GenerateUserPartsInput
): OpenAiGenerateUserContentPart[] {
    const userMessageContent: OpenAiGenerateUserContentPart[] = []

    if (input.notes) {
        userMessageContent.push({ type: "text", text: `Field Notes:\n${input.notes}` })
    } else {
        userMessageContent.push({ type: "text", text: "Please generate an estimate based on the attached images." })
    }

    for (const imageUrl of input.images ?? []) {
        userMessageContent.push({
            type: "image_url",
            image_url: {
                url: imageUrl,
            },
        })
    }

    return userMessageContent
}

export function buildGeminiGenerateUserParts(input: GenerateUserPartsInput): GeminiGenerateContentPart[] {
    const parts: GeminiGenerateContentPart[] = []

    if (input.notes?.trim()) {
        parts.push({ text: `Field Notes:\n${input.notes}` })
    } else {
        parts.push({ text: "Please generate an estimate based on the attached images." })
    }

    for (const rawImage of input.images ?? []) {
        const inlineData = parseBase64ImageDataUrl(rawImage)
        if (inlineData) {
            parts.push({
                inlineData: {
                    mimeType: inlineData.mimeType,
                    data: inlineData.data,
                },
            })
            continue
        }

        parts.push({
            text: `Reference image URL: ${rawImage}`,
        })
    }

    return parts
}
