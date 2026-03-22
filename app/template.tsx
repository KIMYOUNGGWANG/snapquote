"use client"

import { ReactNode } from "react"

export default function Template({ children }: { children: ReactNode }) {
  // Using Tailwind's animate-in utility to create a subtle, premium native-app style fade and slide
  return (
    <div className="animate-in fade-in slide-in-from-bottom-[8px] duration-[220ms] fill-mode-both ease-out">
      {children}
    </div>
  )
}
