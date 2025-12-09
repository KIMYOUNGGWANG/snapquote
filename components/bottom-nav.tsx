"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, PlusCircle, History, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"

export function BottomNav() {
    const pathname = usePathname()

    const links = [
        { href: "/", label: "Home", icon: Home },
        { href: "/new-estimate", label: "New", icon: PlusCircle },
        { href: "/history", label: "History", icon: History },
        { href: "/profile", label: "Profile", icon: User },
    ]

    return (
        <nav className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-2 pb-4 z-50">
            <div className="flex justify-around items-center max-w-md mx-auto">
                {links.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex flex-col items-center p-2 rounded-lg transition-colors min-w-[60px]",
                                isActive ? "text-primary" : "text-muted-foreground hover:text-primary"
                            )}
                        >
                            <Icon className="h-5 w-5" />
                            <span className="text-[10px] mt-1">{label}</span>
                        </Link>
                    )
                })}
                {/* Theme Toggle */}
                <div className="flex flex-col items-center p-2 min-w-[60px]">
                    <ThemeToggle />
                    <span className="text-[10px] mt-1 text-muted-foreground">Theme</span>
                </div>
            </div>
        </nav>
    )
}
