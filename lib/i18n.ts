export type Language = "en" | "es" | "ko"

export const translations = {
    en: {
        new_estimate: "New Estimate",
        history: "History",
        clients: "Clients",
        profile: "Profile",
        home: "Home",
        receipts: "Receipts",
        send: "Send",
        save: "Save",
        copy: "Copy",
        cancel: "Cancel",
        back: "Back",
        next: "Next",
        done: "Done",
        follow_up_needed: "Follow Up Needed",
        copy_message: "Copy Message",
        open_email: "Open Email App",
        speak_job: "Speak Your Job",
        creating_estimate: "Creating Estimate...",
        estimate_ready: "Estimate Ready",
        select_trade: "Select Your Trade",
        send_instantly: "Send PDF Instantly",
    },
    es: {
        new_estimate: "Nueva Cotización",
        history: "Historial",
        clients: "Clientes",
        profile: "Perfil",
        home: "Inicio",
        receipts: "Recibos",
        send: "Enviar",
        save: "Guardar",
        copy: "Copiar",
        cancel: "Cancelar",
        back: "Atrás",
        next: "Siguiente",
        done: "Listo",
        follow_up_needed: "Seguimiento Necesario",
        copy_message: "Copiar Mensaje",
        open_email: "Abrir Correo",
        speak_job: "Describe el Trabajo",
        creating_estimate: "Creando Cotización...",
        estimate_ready: "Cotización Lista",
        select_trade: "Selecciona tu Oficio",
        send_instantly: "Enviar PDF al Instante",
    },
    ko: {
        new_estimate: "새 견적",
        history: "기록",
        clients: "고객",
        profile: "프로필",
        home: "홈",
        receipts: "영수증",
        send: "보내기",
        save: "저장",
        copy: "복사",
        cancel: "취소",
        back: "뒤로",
        next: "다음",
        done: "완료",
        follow_up_needed: "팔로업 필요",
        copy_message: "메시지 복사",
        open_email: "이메일 앱 열기",
        speak_job: "작업 내용 말하기",
        creating_estimate: "견적 생성 중...",
        estimate_ready: "견적 완료",
        select_trade: "업종 선택",
        send_instantly: "PDF 즉시 발송",
    },
} satisfies Record<Language, Record<string, string>>

export type TranslationKey = keyof typeof translations.en

export function t(key: string, lang: Language): string {
    const dict = translations[lang] as Record<string, string>
    return dict[key] ?? key
}

export function getStoredLanguage(): Language {
    try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("snapquote_language") : null
        if (stored === "en" || stored === "es" || stored === "ko") return stored
    } catch {}
    return "en"
}

export function setStoredLanguage(lang: Language): void {
    try {
        if (typeof window !== "undefined") {
            localStorage.setItem("snapquote_language", lang)
        }
    } catch {}
}

import { useState, useEffect } from "react"

export function useLanguage(): { lang: Language; setLang: (l: Language) => void; t: (key: string) => string } {
    const [lang, setLangState] = useState<Language>("en")

    useEffect(() => {
        setLangState(getStoredLanguage())
    }, [])

    const setLang = (l: Language) => {
        setStoredLanguage(l)
        setLangState(l)
    }

    return {
        lang,
        setLang,
        t: (key: string) => t(key, lang),
    }
}
