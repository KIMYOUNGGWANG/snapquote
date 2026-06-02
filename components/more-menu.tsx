"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { Clock3, FileText, History, Users, Settings, Moon, Sun, LogOut, LifeBuoy, LogIn, Loader2, Sparkles, UserPlus, MessageSquarePlus } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FeedbackModal } from "@/components/feedback-modal"
import { supabase } from "@/lib/supabase"
import { getDraftEstimates, type LocalEstimate } from "@/lib/estimates-storage"
import { isCaptureOnlyDraft } from "@/lib/estimates/draft-state"
import { getAllItemsFromEstimate } from "@/lib/estimates/math"
import { subscribeOfflineQueueChanged } from "@/lib/offline-events"
import { useTheme } from "@/components/theme-provider"

interface MoreMenuProps {
    children: React.ReactNode
}

export function MoreMenu({ children }: MoreMenuProps) {
    const { theme, setTheme } = useTheme()
    const pathname = usePathname()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false)
    const [authLoading, setAuthLoading] = useState(true)
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [draftSummary, setDraftSummary] = useState<{ count: number; needsAiDraft: number; needsPricing: number } | null>(null)

    const getDraftSummaryDescription = (summary: { count: number; needsAiDraft: number; needsPricing: number }) => {
        if (summary.count === 0) return "Start or resume local quote drafts"

        const openDrafts = `${summary.count} open draft${summary.count === 1 ? "" : "s"}`
        if (summary.needsAiDraft > 0) {
            const needsAiDraft = summary.needsAiDraft === 1 ? "1 needs AI draft" : `${summary.needsAiDraft} need AI drafts`
            return `${openDrafts} · ${needsAiDraft}`
        }
        if (summary.needsPricing > 0) {
            const needsPricing = summary.needsPricing === 1 ? "1 needs pricing" : `${summary.needsPricing} need pricing`
            return `${openDrafts} · ${needsPricing}`
        }

        return openDrafts
    }

    const draftDescription = draftSummary
        ? getDraftSummaryDescription(draftSummary)
        : "Resume open quotes"

    const draftItem = { href: "/drafts", label: "Draft Workbench", icon: FileText, description: draftDescription }
    const workMenuItems = [
        { href: "/clients", label: "Clients", icon: Users, description: "Customer list" },
        { href: "/history", label: "History", icon: History, description: "Past estimates" },
        { href: "/time-tracking", label: "Time Tracking", icon: Clock3, description: "Job hours" },
        { href: "/team", label: "Team Workspace", icon: UserPlus, description: "Crew review" },
    ]
    const adminMenuItems = [
        { href: "/pricing", label: "Upgrade / Billing", icon: Sparkles, description: "Subscription" },
        { href: "/profile", label: "Settings", icon: Settings, description: "Preferences" },
    ]

    const loginHref = useMemo(() => {
        const params = new URLSearchParams({ next: pathname || "/" })
        return `/login?${params.toString()}`
    }, [pathname])

    useEffect(() => {
        let active = true

        const loadDraftSummary = async () => {
            try {
                const drafts = await getDraftEstimates()
                if (!active) return

                setDraftSummary({
                    count: drafts.length,
                    needsAiDraft: drafts.filter(isCaptureOnlyDraft).length,
                    needsPricing: drafts.reduce((sum, draft: LocalEstimate) => {
                        if (isCaptureOnlyDraft(draft)) return sum

                        const missingPriceCount = getAllItemsFromEstimate(draft).filter((item) => item.unit_price === 0).length
                        return sum + missingPriceCount
                    }, 0),
                })
            } catch {
                if (active) setDraftSummary(null)
            }
        }

        void supabase.auth.getSession().then(({ data }) => {
            if (!active) return
            setUserEmail(data.session?.user?.email ?? null)
            setAuthLoading(false)
        })
        void loadDraftSummary()

        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!active) return
            setUserEmail(session?.user?.email ?? null)
            setAuthLoading(false)
        })
        const handleFocus = () => {
            void loadDraftSummary()
        }
        const unsubscribeDrafts = subscribeOfflineQueueChanged(handleFocus)
        window.addEventListener("focus", handleFocus)

        return () => {
            active = false
            data.subscription.unsubscribe()
            unsubscribeDrafts()
            window.removeEventListener("focus", handleFocus)
        }
    }, [])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = "/"
    }

    const handleRestartTutorial = () => {
        window.location.href = "/new-estimate?tutorial=1"
    }

    return (
        <>
            <Dialog open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <DialogTrigger asChild>
                    {children}
                </DialogTrigger>
                <DialogContent
                    className="fixed !bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 !top-auto z-[201] flex max-h-[calc(100vh-7rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 !translate-y-0 flex-col overflow-hidden rounded-lg border-white/10 bg-slate-950 p-0 text-white shadow-2xl data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
                    data-testid="more-menu-dialog"
                >
                    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-3">
                        <DialogHeader className="mb-3 pr-12 text-left">
                            <DialogTitle className="text-lg font-semibold text-white">Field menu</DialogTitle>
                            <DialogDescription className="leading-5">
                                Resume work, manage customers, and tune the app.
                            </DialogDescription>
                        </DialogHeader>

                        <DialogClose asChild>
                            <Link
                                href={draftItem.href}
                                aria-current={pathname === draftItem.href || pathname?.startsWith(`${draftItem.href}/`) ? "page" : undefined}
                                data-testid="more-menu-drafts-link"
                                className="mb-3 flex min-h-20 items-center rounded-lg border border-blue-300/25 bg-blue-500/15 p-3 transition-colors hover:border-blue-300/40 hover:bg-blue-500/20"
                            >
                                <div className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-950/60 text-blue-100">
                                    <draftItem.icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-blue-50">{draftItem.label}</div>
                                    <div className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-blue-100/75 [overflow-wrap:anywhere]">
                                        {draftItem.description}
                                    </div>
                                </div>
                            </Link>
                        </DialogClose>

                        <div className="mb-3" data-testid="more-menu-work-shortcuts">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Work shortcuts</p>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Field ops</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {workMenuItems.map((item) => {
                                    const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)

                                    return (
                                        <DialogClose asChild key={item.href}>
                                            <Link
                                                href={item.href}
                                                aria-current={isActive ? "page" : undefined}
                                                data-testid={`more-menu-${item.href.slice(1).replace("/", "-")}-link`}
                                                className={`min-h-20 rounded-lg border p-2.5 transition-colors hover:border-blue-400/30 hover:bg-slate-900 ${
                                                    isActive
                                                        ? "border-blue-400/30 bg-blue-500/10"
                                                        : "border-white/10 bg-slate-900/60"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-blue-200">
                                                        <item.icon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="line-clamp-2 break-words text-sm font-medium leading-4 text-white [overflow-wrap:anywhere]">{item.label}</div>
                                                        <div className="mt-0.5 truncate text-xs text-slate-400">{item.description}</div>
                                                    </div>
                                                </div>
                                            </Link>
                                        </DialogClose>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="mb-3 rounded-lg border border-white/10 bg-slate-900/70 p-2.5" data-testid="more-menu-account-card">
                            {authLoading ? (
                                <p className="flex items-center gap-2 text-xs text-slate-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Checking account...
                                </p>
                            ) : userEmail ? (
                                <div className="space-y-2">
                                    <p className="break-all text-xs leading-5 text-slate-400">
                                        Signed in as <span className="font-medium text-white">{userEmail}</span>
                                    </p>
                                    <DialogClose asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-10 w-full justify-start rounded-lg border-white/10 bg-slate-950/60 text-white hover:bg-slate-900"
                                            onClick={handleSignOut}
                                        >
                                            <LogOut className="h-4 w-4 mr-2" />
                                            Sign Out
                                        </Button>
                                    </DialogClose>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-400">
                                        Not signed in yet. First login email automatically creates your account.
                                    </p>
                                    <DialogClose asChild>
                                        <Button asChild className="h-11 w-full justify-start rounded-lg bg-[#0756b7] text-white hover:bg-[#064ca3]">
                                            <Link href={loginHref} className="flex w-full items-center">
                                                <LogIn className="h-4 w-4 mr-2" />
                                                Sign In / Sign Up
                                            </Link>
                                        </Button>
                                    </DialogClose>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2" data-testid="more-menu-admin-shortcuts">
                            {adminMenuItems.map((item) => {
                                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`)

                                return (
                                <DialogClose asChild key={item.href}>
                                    <Link
                                        href={item.href}
                                        aria-current={isActive ? "page" : undefined}
                                        className={`flex items-center rounded-lg border p-2.5 transition-colors hover:border-blue-400/30 hover:bg-slate-900 ${
                                            isActive
                                                ? "border-blue-400/30 bg-blue-500/10"
                                                : "border-white/10 bg-slate-900/60"
                                        }`}
                                    >
                                        <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-blue-200">
                                            <item.icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-white">{item.label}</div>
                                            <div className="text-xs text-slate-400">{item.description}</div>
                                        </div>
                                    </Link>
                                </DialogClose>
                                )
                            })}
                        </div>
                    </div>

                    <div className="mt-2 rounded-b-lg border-t border-white/10 bg-slate-900/70 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-medium text-slate-400">Help & appearance</div>
                                <div className="text-xs text-slate-500">Feedback, tutorial, theme</div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-lg text-slate-300 hover:bg-white/10"
                                    onClick={() => {
                                        setIsMenuOpen(false)
                                        setIsFeedbackOpen(true)
                                    }}
                                    title="Send feedback"
                                    aria-label="Send feedback"
                                    data-testid="more-menu-feedback"
                                >
                                    <MessageSquarePlus className="h-4 w-4" />
                                </Button>
                                <DialogClose asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-lg text-slate-300 hover:bg-white/10"
                                        onClick={handleRestartTutorial}
                                        title="Restart Tutorial"
                                        data-testid="more-menu-restart-tutorial"
                                    >
                                        <LifeBuoy className="h-4 w-4" />
                                        <span className="sr-only">Restart Tutorial</span>
                                    </Button>
                                </DialogClose>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-lg text-slate-300 hover:bg-white/10"
                                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                    title="Toggle theme"
                                    data-testid="more-menu-theme-toggle"
                                >
                                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                                    <span className="sr-only">Toggle theme</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <FeedbackModal open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen} />
        </>
    )
}
