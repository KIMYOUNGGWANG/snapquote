"use client"

import * as React from "react"

type ThemeName = "dark" | "light"
type ThemeAttribute = "class" | `data-${string}`

interface ThemeContextValue {
    theme: ThemeName
    setTheme: React.Dispatch<React.SetStateAction<ThemeName>>
}

interface ThemeProviderProps extends React.PropsWithChildren {
    attribute?: ThemeAttribute | ThemeAttribute[]
    defaultTheme?: ThemeName | "system"
    disableTransitionOnChange?: boolean
    enableColorScheme?: boolean
    enableSystem?: boolean
    forcedTheme?: ThemeName
    storageKey?: string
    value?: Record<string, string>
}

const ThemeContext = React.createContext<ThemeContextValue>({
    theme: "dark",
    setTheme: () => undefined,
})

function normalizeTheme(theme: ThemeProviderProps["defaultTheme"], enableSystem: boolean): ThemeName {
    if (theme === "light" || theme === "dark") return theme
    if (enableSystem && typeof window !== "undefined") {
        return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
    }
    return "dark"
}

function applyTheme({
    attribute,
    enableColorScheme,
    theme,
    value,
}: {
    attribute: ThemeAttribute | ThemeAttribute[]
    enableColorScheme: boolean
    theme: ThemeName
    value?: Record<string, string>
}) {
    const root = document.documentElement
    const attributes = Array.isArray(attribute) ? attribute : [attribute]
    const activeValue = value?.[theme] ?? theme
    const allValues = Object.values(value ?? { dark: "dark", light: "light" })

    for (const item of attributes) {
        if (item === "class") {
            root.classList.remove(...allValues)
            root.classList.add(activeValue)
        } else {
            root.setAttribute(item, activeValue)
        }
    }

    if (enableColorScheme) {
        root.style.colorScheme = theme
    }
}

function temporarilyDisableTransitions() {
    const style = document.createElement("style")
    style.appendChild(
        document.createTextNode("*,*::before,*::after{transition:none!important}")
    )
    document.head.appendChild(style)

    window.getComputedStyle(document.body)
    window.setTimeout(() => {
        style.remove()
    }, 1)
}

export function ThemeProvider({
    attribute = "class",
    children,
    defaultTheme = "dark",
    disableTransitionOnChange = false,
    enableColorScheme = true,
    enableSystem = false,
    forcedTheme,
    storageKey = "theme",
    value,
}: ThemeProviderProps) {
    const [theme, setThemeState] = React.useState<ThemeName>(() => normalizeTheme(defaultTheme, enableSystem))

    React.useEffect(() => {
        if (forcedTheme) {
            setThemeState(forcedTheme)
            return
        }

        try {
            const storedTheme = window.localStorage.getItem(storageKey)
            if (storedTheme === "dark" || storedTheme === "light") {
                setThemeState(storedTheme)
            }
        } catch {
            setThemeState(normalizeTheme(defaultTheme, enableSystem))
        }
    }, [defaultTheme, enableSystem, forcedTheme, storageKey])

    React.useEffect(() => {
        if (disableTransitionOnChange) temporarilyDisableTransitions()
        applyTheme({
            attribute,
            enableColorScheme,
            theme: forcedTheme ?? theme,
            value,
        })
    }, [attribute, disableTransitionOnChange, enableColorScheme, forcedTheme, theme, value])

    const setTheme = React.useCallback<React.Dispatch<React.SetStateAction<ThemeName>>>((nextTheme) => {
        setThemeState((currentTheme) => {
            const resolvedTheme = typeof nextTheme === "function" ? nextTheme(currentTheme) : nextTheme
            try {
                window.localStorage.setItem(storageKey, resolvedTheme)
            } catch {
                // localStorage can be unavailable in private browsing or restricted webviews.
            }
            return resolvedTheme
        })
    }, [storageKey])

    const contextValue = React.useMemo(() => ({ theme: forcedTheme ?? theme, setTheme }), [forcedTheme, setTheme, theme])

    return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme() {
    return React.useContext(ThemeContext)
}
