"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, PlusCircle, History, User, Receipt, Clock, Users, Bot } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"

export function BottomNav() {
    const pathname = usePathname()

    const links = [
        { href: "/", label: "Home", icon: Home },
        { href: "/new-estimate", label: "New", icon: PlusCircle },
        { href: "/receipts", label: "Receipts", icon: Receipt },
        { href: "/automation", label: "Auto", icon: Bot },
        { href: "/clients", label: "Clients", icon: Users },
        { href: "/history", label: "History", icon: History },
        { href: "/profile", label: "Profile", icon: User },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-1 pb-3 z-50 safe-area-inset-bottom">
            <div className="flex justify-between items-center w-full px-1">
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex flex-col items-center p-1 rounded-lg transition-colors flex-1",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-[9px] mt-0.5 truncate max-w-full">{label}</span>
                        </Link>
                    )
                })}
                {/* Theme Toggle */}
                <div className="flex flex-col items-center p-1 flex-1">
                    <ThemeToggle />
                    <span className="text-[9px] mt-0.5 text-muted-foreground">Theme</span>
                </div>
            </div>
        </nav>
    )
}

