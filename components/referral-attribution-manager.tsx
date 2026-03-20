"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { claimReferralToken } from "@/lib/referrals"
import { toast } from "@/components/toast"

const REFERRAL_TOKEN_PATTERN = /^[a-z0-9]{8,32}$/

async function maybeClaimStoredReferral(userId: string) {
    if (typeof window === "undefined") return

    const token = localStorage.getItem("snapquote_ref_token")?.trim().toLowerCase() || ""
    if (!REFERRAL_TOKEN_PATTERN.test(token)) return

    const storageKey = `snapquote_ref_claimed:${userId}:${token}`
    if (sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)) return

    const result = await claimReferralToken(token, "auth_session")
    if (!result) return

    sessionStorage.setItem(storageKey, "1")
    localStorage.setItem(storageKey, "1")
    localStorage.removeItem("snapquote_ref_token")

    if (result.claimed && result.referredReward.applied && result.referredReward.endsAt) {
        toast("🎁 Referral applied. Pro is unlocked for 14 days.", "success")
    }
}

export function ReferralAttributionManager() {
    useEffect(() => {
        void supabase.auth.getSession().then(({ data: { session } }) => {
            const userId = session?.user?.id
            if (userId) {
                void maybeClaimStoredReferral(userId)
            }
        })

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            const userId = session?.user?.id
            if (userId) {
                void maybeClaimStoredReferral(userId)
            }
        })

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [])

    return null
}
