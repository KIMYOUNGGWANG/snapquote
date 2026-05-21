"use client"

import type { JSX } from "react"
import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { getPriceList } from "@/lib/db"
import { cn } from "@/lib/utils"
import type { PriceListItem } from "@/types"

interface PriceListAutocompleteProps {
    value: string
    onChange: (value: string) => void
    onSelect: (item: PriceListItem) => void
    placeholder?: string
    className?: string
}

function formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: price % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(price)
}

function formatUnit(unit: PriceListItem["unit"]): string {
    return unit.replaceAll("_", " ")
}

function getMatchScore(item: PriceListItem, query: string): number {
    const normalizedName = item.name.toLowerCase()
    let score = 0

    if (normalizedName === query) {
        score = 400
    } else if (normalizedName.startsWith(query)) {
        score = 320
    } else if (normalizedName.includes(query)) {
        score = 220
    }

    for (const keyword of item.keywords) {
        const normalizedKeyword = keyword.toLowerCase()

        if (normalizedKeyword === query) {
            score = Math.max(score, 300)
            continue
        }

        if (normalizedKeyword.startsWith(query)) {
            score = Math.max(score, 240)
            continue
        }

        if (normalizedKeyword.includes(query)) {
            score = Math.max(score, 180)
        }
    }

    if (score === 0) {
        return 0
    }

    return score + Math.min(item.usageCount, 50)
}

function findMatches(items: PriceListItem[], rawQuery: string): PriceListItem[] {
    const query = rawQuery.trim().toLowerCase()

    if (!query) {
        return []
    }

    return items
        .map((item) => ({ item, score: getMatchScore(item, query) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) =>
            right.score - left.score ||
            right.item.usageCount - left.item.usageCount ||
            left.item.name.localeCompare(right.item.name)
        )
        .slice(0, 6)
        .map(({ item }) => item)
}

export function PriceListAutocomplete({
    value,
    onChange,
    onSelect,
    placeholder = "Search price list",
    className,
}: PriceListAutocompleteProps): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)
    const skipNextSearchRef = useRef(false)
    const [results, setResults] = useState<PriceListItem[]>([])
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const handleMouseDown = (event: MouseEvent) => {
            if (containerRef.current?.contains(event.target as Node)) {
                return
            }

            setIsOpen(false)
        }

        document.addEventListener("mousedown", handleMouseDown)
        return () => document.removeEventListener("mousedown", handleMouseDown)
    }, [])

    useEffect(() => {
        const query = value.trim()

        if (!query) {
            setResults([])
            setIsOpen(false)
            skipNextSearchRef.current = false
            return
        }

        if (skipNextSearchRef.current) {
            skipNextSearchRef.current = false
            setResults([])
            setIsOpen(false)
            return
        }

        let active = true

        const loadMatches = async () => {
            try {
                const items = await getPriceList()

                if (!active) {
                    return
                }

                const nextResults = findMatches(items, query)
                setResults(nextResults)
                setIsOpen(nextResults.length > 0)
            } catch (error) {
                if (!active) {
                    return
                }

                console.error("Failed to load price list matches", error)
                setResults([])
                setIsOpen(false)
            }
        }

        void loadMatches()

        return () => {
            active = false
        }
    }, [value])

    const handleSelect = (item: PriceListItem) => {
        skipNextSearchRef.current = true
        onSelect(item)
        onChange(item.name)
        setIsOpen(false)
    }

    return (
        <div ref={containerRef} className={cn("relative w-full", className)}>
            <Input
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
                onFocus={() => setIsOpen(results.length > 0 && value.trim().length > 0)}
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls="price-list-autocomplete-results"
                autoComplete="off"
            />

            {isOpen && results.length > 0 ? (
                <div
                    id="price-list-autocomplete-results"
                    className="absolute top-full z-50 mt-2 w-full overflow-hidden rounded-2xl border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_20px_44px_-28px_rgba(15,23,42,0.88)] backdrop-blur-xl"
                    role="listbox"
                >
                    <div className="max-h-96 overflow-y-auto p-2">
                        {results.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSelect(item)}
                                className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                role="option"
                                aria-selected={false}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="truncate font-semibold text-foreground">
                                            {item.name}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className="border-primary/30 bg-primary/10 text-[10px] text-primary"
                                        >
                                            💡 가격표
                                        </Badge>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        <span>{formatPrice(item.price)}</span>
                                        <span>/</span>
                                        <span>{formatUnit(item.unit)}</span>
                                    </div>
                                </div>

                                <Badge
                                    variant="outline"
                                    className="shrink-0 border-border/70 bg-background/70 text-[10px] text-muted-foreground"
                                >
                                    {item.category}
                                </Badge>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
