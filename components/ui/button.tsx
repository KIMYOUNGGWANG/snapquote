"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { useHaptic } from "@/hooks/use-haptic"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_18px_32px_-20px_hsl(var(--primary)/0.85)] hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_18px_32px_-20px_hsl(var(--destructive)/0.7)] hover:bg-destructive/90",
        outline:
          "border border-input/80 bg-background/80 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.8)] hover:bg-accent/80 hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_18px_32px_-22px_hsl(var(--secondary)/0.75)] hover:bg-secondary/85",
        ghost: "shadow-none hover:bg-accent/80 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-10 min-h-10 px-3.5 text-xs",
        lg: "h-12 px-8 text-sm",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const haptic = useHaptic()

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        haptic.light()
        onClick?.(e)
      },
      [haptic, onClick]
    )

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={handleClick}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
