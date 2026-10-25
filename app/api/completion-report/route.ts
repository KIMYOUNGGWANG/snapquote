import { OpenAI } from "openai"
import { NextResponse } from "next/server"
import { buildCompletionSystemPrompt, buildCompletionUserNotes } from "@/lib/ai/completion-prompt"
import { requireGeminiText } from "@/lib/ai/gemini"
import { resolveGenerateProvider } from "@/lib/ai/generate-provider"
import {
    buildGeminiGenerateUserParts,
    buildOpenAiGenerateUserContent,
} from "@/lib/ai/generate-provider-parts"
import { parsePotentialJsonContent } from "@/lib/ai/json"
import { sanitizeCompletionMatches } from "@/lib/job-completion"
import { resolveGeneratePlanTier } from "@/lib/server/generate-plan-tier"
import { parseJsonRequest } from "@/lib/server/request-validation"
import { requireAuthenticatedUser } from "@/lib/server/route-auth"
import { createServiceSupabaseClient } from "@/lib/server/stripe-connect"
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota"
import { completionReportRequestSchema } from "@/lib/validation/api-schemas"

type ModelResult = {
    content: string
    promptTokens: number
    completionTokens: number
}

type ModelInput = {
    systemPrompt: string
    notes: string
    images: string[]
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
})

const OPENAI_MODEL = process.env.OPENAI_GENERATE_MODEL?.trim() || "gpt-4o"
const GEMINI_MODEL = process.env.GEMINI_GENERATE_MODEL?.trim() || "gemini-2.5-flash"
const MAX_OUTPUT_TOKENS = 8000
const FREE_COMPLETIONS_PER_MONTH = 2
const PAID_TIERS = new Set(["starter", "pro", "team"])

async function matchWithGemini(input: ModelInput): Promise<ModelResult> {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
        throw new Error("Gemini is not configured. Please add GEMINI_API_KEY.")
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { role: "system", parts: [{ text: input.systemPrompt }] },
            contents: [
                {
                    role: "user",
                    parts: buildGeminiGenerateUserParts({ notes: input.notes, images: input.images }),
                },
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: MAX_OUTPUT_TOKENS,
                responseMimeType: "application/json",
            },
        }),
        cache: "no-store",
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
        throw new Error(`Gemini request failed (${response.status})`)
    }

    return {
        content: requireGeminiText(payload),
        promptTokens: Number(payload?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(payload?.usageMetadata?.candidatesTokenCount || 0),
    }
}

async function matchWithOpenAI(input: ModelInput): Promise<ModelResult> {
    const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
            { role: "system", content: input.systemPrompt },
            { role: "user", content: buildOpenAiGenerateUserContent({ notes: input.notes, images: input.images }) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
    })

    const content = response.choices[0].message.content
    if (!content) {
        throw new Error("No content generated")
    }

    return {
        content,
        promptTokens: Number(response.usage?.prompt_tokens || 0),
        completionTokens: Number(response.usage?.completion_tokens || 0),
    }
}

function startOfMonthUtcIso(now = new Date()): string {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Completion reports this user saved this month (UTC), capped at the free limit. Null when it cannot be read. */
async function countCompletionsThisMonth(userId: string): Promise<number | null> {
    const supabase = createServiceSupabaseClient()
    if (!supabase) return null

    const { data, error } = await supabase
        .from("estimate_attachments")
        .select("id, estimates!inner(user_id)")
        .eq("estimates.user_id", userId)
        .gte("completion->>completedAt", startOfMonthUtcIso())
        .limit(FREE_COMPLETIONS_PER_MONTH)

    if (error || !Array.isArray(data)) return null
    return data.length
}

export async function POST(req: Request) {
    try {
        const auth = await requireAuthenticatedUser(req)
        if (!auth.ok) {
            return auth.response
        }

        const parsedPayload = await parseJsonRequest(req, completionReportRequestSchema)
        if (!parsedPayload.ok) {
            return parsedPayload.response
        }
        const { items, photos, note } = parsedPayload.data

        // Fail closed: if the plan cannot be resolved, treat the user as free.
        const planTierResult = await resolveGeneratePlanTier(auth.userId)
        const isPaid = planTierResult.ok && PAID_TIERS.has(planTierResult.planTier)

        if (!isPaid) {
            const used = await countCompletionsThisMonth(auth.userId)
            if (used === null) {
                return NextResponse.json(
                    { ok: false, error: "Failed to check completion report limit" },
                    { status: 500 }
                )
            }
            if (used >= FREE_COMPLETIONS_PER_MONTH) {
                return NextResponse.json(
                    { error: "Free plan includes 2 completion reports per month." },
                    { status: 402 }
                )
            }
        }

        const quota = await enforceUsageQuota(req, "generate", { requireAuth: true })
        if (!quota.ok) {
            return NextResponse.json(
                {
                    error: quota.error || "Free plan limit reached",
                    code: "FREE_PLAN_LIMIT_REACHED",
                    metric: "generate",
                    usage: quota.used,
                    limit: quota.limit,
                },
                { status: quota.status || 402 }
            )
        }

        let modelResult: ModelResult
        let rawMatches: unknown
        try {
            const input: ModelInput = {
                systemPrompt: buildCompletionSystemPrompt(photos.length),
                notes: buildCompletionUserNotes(items, note),
                images: photos,
            }
            modelResult =
                resolveGenerateProvider() === "gemini"
                    ? await matchWithGemini(input)
                    : await matchWithOpenAI(input)
            rawMatches = parsePotentialJsonContent(modelResult.content)
        } catch (error) {
            console.error("Completion report AI matching failed:", error)
            return NextResponse.json({ ok: false, error: "AI matching failed" }, { status: 502 })
        }

        const matches = sanitizeCompletionMatches(
            rawMatches,
            items.map((item) => item.itemId),
            photos.length
        )

        await recordUsage(quota.context, "generate", {
            promptTokens: modelResult.promptTokens,
            completionTokens: modelResult.completionTokens,
        })

        return NextResponse.json({ ok: true, ...matches })
    } catch (error) {
        console.error("Error generating completion report:", error)
        return NextResponse.json({ ok: false, error: "Failed to generate completion report" }, { status: 500 })
    }
}
