import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { toFile } from "openai/uploads";

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const audioFile = formData.get("file") as File;

        if (!audioFile) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Convert File to OpenAI-compatible format if needed, but 'openai' package handles File objects from formData usually.
        // However, sometimes we need to ensure it has a name and type.

        // Trade terminology hint for better Whisper recognition
        const TRADE_HINT = "2x4 2x6 4x4 studs joists drywall sheetrock PVC PEX copper P-trap ball valve Moen Delta Kohler GFCI breaker TBD mold rot labor parts materials";

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            language: "en",
            prompt: TRADE_HINT,
        });

        return NextResponse.json({ text: transcription.text });
    } catch (error) {
        console.error("Transcription error:", error);
        return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }
}
