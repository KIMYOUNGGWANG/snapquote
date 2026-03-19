import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { enforceUsageQuota, recordUsage } from "@/lib/server/usage-quota";

const SUPPORTED_TRANSCRIPTION_HINTS = new Set(["auto", "en", "es", "ko"])

function getLanguageHint(formData: FormData): "auto" | "en" | "es" | "ko" {
    const value = formData.get("languageHint")
    if (typeof value !== "string") return "auto"

    const normalized = value.trim().toLowerCase()
    if (SUPPORTED_TRANSCRIPTION_HINTS.has(normalized)) {
        return normalized as "auto" | "en" | "es" | "ko"
    }

    throw new Error("INVALID_LANGUAGE_HINT")
}

function buildTradeHint(languageHint: "auto" | "en" | "es" | "ko"): string {
    const sharedTerms = [
        "two 2x4", "two 2x6", "4x4", "studs", "joists", "drywall", "sheetrock", "PVC", "PEX",
        "copper", "P-trap", "ball valve", "Moen", "Delta", "Kohler", "GFCI", "breaker",
        "mold", "rot", "labor", "parts", "materials", "rough-in", "trim-out",
    ]
    const spanishTerms = [
        "fuga", "llave angular", "desague", "tubo PVC", "cobre", "calentador", "tomacorriente",
        "interruptor", "disyuntor", "breaker", "condensador", "evaporadora", "mano de obra",
    ]
    const koreanTerms = [
        "누수", "배관", "수전", "변기", "차단기", "콘센트", "전선", "에어컨", "배수", "노무",
    ]

    if (languageHint === "es") return [...sharedTerms, ...spanishTerms].join(", ")
    if (languageHint === "ko") return [...sharedTerms, ...koreanTerms].join(", ")
    return [...sharedTerms, ...spanishTerms, ...koreanTerms].join(", ")
}

export async function POST(req: Request) {
    try {
        const quota = await enforceUsageQuota(req, "transcribe", { requireAuth: false })
        if (!quota.ok) {
            const status = quota.status || 402
            const isQuotaLimit = status === 402

            return NextResponse.json(
                {
                    error: quota.error || (isQuotaLimit ? "Free plan limit reached" : "Request rejected"),
                    code: isQuotaLimit ? "FREE_PLAN_LIMIT_REACHED" : status === 401 ? "UNAUTHORIZED" : "USAGE_CONTEXT_ERROR",
                    metric: "transcribe",
                    ...(isQuotaLimit ? { usage: quota.used, limit: quota.limit } : {}),
                },
                { status }
            )
        }

        const ip = getClientIp(req)
        const rateLimit = await checkRateLimit({
            key: `transcribe:${ip}`,
            limit: 40,
            windowMs: 10 * 60 * 1000,
        })

        if (!rateLimit.allowed) {
            return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
        }

        const formData = await req.formData();
        const audioFile = formData.get("file") as File;
        let languageHint: "auto" | "en" | "es" | "ko" = "auto"

        if (!audioFile) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!audioFile.type.startsWith("audio/")) {
            return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
        }

        if (audioFile.size > 20 * 1024 * 1024) {
            return NextResponse.json({ error: "Audio file too large" }, { status: 413 });
        }

        try {
            languageHint = getLanguageHint(formData)
        } catch {
            return NextResponse.json({ error: "Invalid language hint" }, { status: 400 })
        }

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            ...(languageHint !== "auto" ? { language: languageHint } : {}),
            prompt: buildTradeHint(languageHint),
        });

        let text = transcription.text;

        // ============================================
        // Post-processing to fix common Whisper errors
        // ============================================

        // 1. Fix "to" vs "two" errors with lumber dimensions
        // "to 2x4" → "two 2x4", "to 2 by 4" → "two 2 by 4"
        text = text.replace(/\b(to|too)\s+(\d+\s*[xX]\s*\d+)/gi, "two $2");
        text = text.replace(/\b(to|too)\s+(\d+)\s+by\s+(\d+)/gi, "two $2 by $3");

        // 2. Fix "2 2x4" → "two 2x4" (number-before-dimension pattern)
        text = text.replace(/\b(\d+)\s+(\d+\s*[xX]\s*\d+)/gi, (match, count, dimension) => {
            const numWords: Record<string, string> = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten' };
            return `${numWords[count] || count} ${dimension}`;
        });

        // 3. Fix "for 2x4" → "four 2x4" (common mishearing of "four")
        text = text.replace(/\b(for|fore)\s+(\d+\s*[xX]\s*\d+)/gi, "four $2");

        // 4. Fix number-word confusions for measurements
        // "ate feet" → "8 feet", "ate foot" → "8 foot"
        text = text.replace(/\bate\s+(feet|foot|ft)\b/gi, "8 $1");
        // "for feet" → "4 feet"
        text = text.replace(/\bfor\s+(feet|foot|ft)\b/gi, "4 $1");
        // "to feet" → "2 feet"
        text = text.replace(/\b(to|too)\s+(feet|foot|ft)\b/gi, "2 $2");

        // 5. Fix common trade term mishearings
        // "pee trap" → "P-trap"
        text = text.replace(/\bpee\s*trap\b/gi, "P-trap");
        // "g f c i" → "GFCI"
        text = text.replace(/\bg\s*f\s*c\s*i\b/gi, "GFCI");

        // 6. Clean up extra whitespace
        text = text.replace(/\s+/g, " ").trim();

        await recordUsage(quota.context, "transcribe")

        return NextResponse.json({ text });
    } catch (error) {
        console.error("Transcription error:", error);
        return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }
}
