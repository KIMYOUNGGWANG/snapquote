"use client"

import { useLanguage, type Language } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const LANGUAGES: { code: Language; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "es", label: "ES" },
    { code: "ko", label: "KO" },
]

export function LanguageSelector() {
    const { lang, setLang } = useLanguage()

    return (
        <div className="flex gap-2">
            {LANGUAGES.map(({ code, label }) => (
                <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                        lang === code
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}
