"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useHaptic } from "@/hooks/use-haptic"
import { Home, PlusCircle, Receipt, Bot, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { MoreMenu } from "@/components/more-menu"

export function BottomNav() {
    const pathname = usePathname()
    const haptic = useHaptic()
    const moreActiveRoutes = ["/clients", "/history", "/profile", "/team", "/time-tracking", "/drafts"]

    const links = [
        { href: "/", label: "Home", icon: Home },
        { href: "/receipts", label: "Receipts", icon: Receipt },
        { href: "/new-estimate", label: "New", icon: PlusCircle, isMain: true },
        { href: "/automation", label: "Auto", icon: Bot },
        { href: "more", label: "More", icon: MoreHorizontal, isTrigger: true },
    ]

    return (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-[100] flex w-full justify-center">
            <nav
                className="pointer-events-auto mx-auto flex w-full max-w-md md:max-w-2xl items-center justify-between border-t border-white/10 bg-slate-950 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_-28px_rgba(0,0,0,0.9)]"
                data-testid="bottom-navigation"
            >
                {links.map(({ href, label, icon: Icon, isMain, isTrigger }) => {
                    const isActive = isTrigger
                        ? moreActiveRoutes.some((route) => pathname === route || pathname?.startsWith(`${route}/`))
                        : pathname === href

                    if (isMain) {
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-label={label}
                                title={label}
                                aria-current={isActive ? "page" : undefined}
                                onClick={() => haptic.medium()}
                                className="mx-1"
                            >
                                <div className={cn(
                                    "flex h-14 min-h-14 w-14 items-center justify-center rounded-lg shadow-lg transition-transform active:scale-95",
                                    "bg-blue-600 text-white shadow-blue-500/20"
                                )}>
                                    <PlusCircle className="h-7 w-7" />
                                    <span className="sr-only">{label}</span>
                                </div>
                            </Link>
                        )
                    }

                    if (isTrigger) {
                        return (
                            <MoreMenu key="more-menu">
                                <button
                                    onClick={() => haptic.light()}
                                    data-testid="bottom-nav-more"
                                    aria-current={isActive ? "page" : undefined}
                                    className={cn(
                                        "flex h-12 w-12 flex-col items-center justify-center rounded-lg transition-colors duration-200",
                                        isActive
                                            ? "bg-blue-500/15 text-blue-300"
                                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                    )}
                                >
                                    <Icon className="h-5 w-5 mb-0.5" />
                                    <span className="text-[9px] font-medium">{label}</span>
                                </button>
                            </MoreMenu>
                        )
                    }

                    return (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => haptic.light()}
                            className={cn(
                                "flex h-12 w-12 flex-col items-center justify-center rounded-lg transition-colors duration-200",
                                isActive
                                    ? "bg-blue-500/15 text-blue-300"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                            )}
                        >
                            <Icon className={cn("h-5 w-5 mb-0.5", isActive && "fill-current/20")} />
                            <span className="text-[9px] font-medium">{label}</span>
                        </Link>
                    )
                })}
            </nav>
        </div>
    )
}
