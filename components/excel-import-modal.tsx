"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { FileSpreadsheet, Upload, Check, X } from "lucide-react"
import type { EstimateUnit, EstimateCategory } from "@/lib/estimates-storage"

interface EstimateItem {
    id: string
    itemNumber: number
    category: EstimateCategory
    description: string
    quantity: number
    unit: EstimateUnit
    unit_price: number
    total: number
}

interface ExcelImportModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (items: EstimateItem[]) => void
}

const COLUMN_MAPPINGS = {
    description: ["description", "desc", "item", "name", "product", "service", "work"],
    quantity: ["quantity", "qty", "amount", "count", "units", "no"],
    unit: ["unit", "uom", "measure", "type"],
    unit_price: ["unit_price", "price", "rate", "cost", "unit price", "unit cost", "$/unit"],
    category: ["category", "type", "cat", "class"],
}

function detectCategory(desc: string): "PARTS" | "LABOR" | "SERVICE" | "OTHER" {
    const lowerDesc = desc.toLowerCase()
    if (lowerDesc.includes("labor") || lowerDesc.includes("labour") || lowerDesc.includes("install") || lowerDesc.includes("work")) {
        return "LABOR"
    }
    if (lowerDesc.includes("permit") || lowerDesc.includes("fee") || lowerDesc.includes("service") || lowerDesc.includes("inspection")) {
        return "SERVICE"
    }
    return "PARTS"
}

function parseCsvToRows(input: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let inQuotes = false

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i]

        if (ch === "\"") {
            if (inQuotes && input[i + 1] === "\"") {
                cell += "\""
                i += 1
            } else {
                inQuotes = !inQuotes
            }
            continue
        }

        if (!inQuotes && ch === ",") {
            row.push(cell.trim())
            cell = ""
            continue
        }

        if (!inQuotes && (ch === "\n" || ch === "\r")) {
            if (ch === "\r" && input[i + 1] === "\n") i += 1
            row.push(cell.trim())
            cell = ""

            if (row.some((value) => value !== "")) {
                rows.push(row)
            }

            row = []
            continue
        }

        cell += ch
    }

    row.push(cell.trim())
    if (row.some((value) => value !== "")) {
        rows.push(row)
    }

    return rows
}

function escapeCsvCell(value: string | number): string {
    const text = String(value)
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`
    }
    return text
}

function downloadCsvTemplate(): void {
    const templateData = [
        ["Description", "Qty", "Unit", "Price", "Category"],
        ["PVC P-Trap", 1, "ea", 15, "PARTS"],
        ["Brass Ball Valve", 1, "ea", 25, "PARTS"],
        ["Installation Labour", 2, "hr", 75, "LABOR"],
        ["Permit Fee", 1, "LS", 50, "SERVICE"],
    ]

    const csv = templateData
        .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
        .join("\r\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "SnapQuote_Template.csv"
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

export function ExcelImportModal({ isOpen, onClose, onImport }: ExcelImportModalProps) {
    const [parsedData, setParsedData] = useState<string[][]>([])
    const [headers, setHeaders] = useState<string[]>([])
    const [fileName, setFileName] = useState("")
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setFileName(file.name)
        setError(null)

        const isCsv = file.name.toLowerCase().endsWith(".csv")
        if (!isCsv) {
            setError("Only CSV files are supported for secure import.")
            setParsedData([])
            setHeaders([])
            return
        }

        const reader = new FileReader()
        reader.onload = (event) => {
            try {
                const text = String(event.target?.result ?? "")
                const rows = parseCsvToRows(text)

                if (rows.length < 2) {
                    setError("File must have at least a header row and one data row")
                    return
                }

                const headerRow = rows[0].map((h) => String(h || "").toLowerCase().trim())
                setHeaders(headerRow)
                setParsedData(rows.slice(1).filter((row) => row.some((value) => String(value).trim() !== "")))
            } catch {
                setError("Failed to parse CSV file. Please verify the file format.")
            }
        }

        reader.readAsText(file)
    }

    const findColumnIndex = (headerValues: string[], targetNames: string[]): number => {
        return headerValues.findIndex((h) => targetNames.some((target) => h.includes(target)))
    }

    const handleImport = () => {
        const descIdx = findColumnIndex(headers, COLUMN_MAPPINGS.description)
        const qtyIdx = findColumnIndex(headers, COLUMN_MAPPINGS.quantity)
        const unitIdx = findColumnIndex(headers, COLUMN_MAPPINGS.unit)
        const priceIdx = findColumnIndex(headers, COLUMN_MAPPINGS.unit_price)
        const catIdx = findColumnIndex(headers, COLUMN_MAPPINGS.category)

        if (descIdx === -1) {
            setError("Could not find a Description column. Please include 'Description', 'Item', or 'Name'.")
            return
        }

        const VALID_UNITS: EstimateUnit[] = ["ea", "LS", "hr", "day", "SF", "LF", "%", "other"]

        const items: EstimateItem[] = parsedData
            .map((row, index) => {
                const description = String(row[descIdx] || "").trim()
                const quantity = Number(row[qtyIdx]) || 1
                const rawUnit = String(row[unitIdx] || "ea").trim()
                const unit_price = Number(row[priceIdx]) || 0
                const category = catIdx !== -1
                    ? (String(row[catIdx]).toUpperCase() as EstimateCategory)
                    : detectCategory(description)

                const unit: EstimateUnit = VALID_UNITS.includes(rawUnit as EstimateUnit)
                    ? (rawUnit as EstimateUnit)
                    : "ea"

                return {
                    id: `csv-${crypto.randomUUID().slice(0, 8)}`,
                    itemNumber: index + 1,
                    category: ["PARTS", "LABOR", "SERVICE", "OTHER"].includes(category) ? category : "PARTS",
                    description,
                    quantity,
                    unit,
                    unit_price,
                    total: quantity * unit_price,
                }
            })
            .filter((item) => item.description.length > 0)

        onImport(items)
        onClose()
        setParsedData([])
        setHeaders([])
        setFileName("")
    }

    const handleClose = () => {
        onClose()
        setParsedData([])
        setHeaders([])
        setFileName("")
        setError(null)
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" />
                        Import from CSV
                    </DialogTitle>
                    <DialogDescription>
                        Upload a CSV file to import estimate items
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={downloadCsvTemplate}
                    >
                        📥 Download CSV Template
                    </Button>

                    <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            {fileName || "Click to upload a CSV file"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            .csv
                        </p>
                    </div>

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    {parsedData.length > 0 && (
                        <div>
                            <h4 className="font-medium mb-2">Preview ({parsedData.length} rows)</h4>
                            <div className="border rounded-lg overflow-x-auto max-h-60">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted">
                                        <tr>
                                            {headers.map((h, i) => (
                                                <th key={i} className="px-3 py-2 text-left font-medium capitalize">
                                                    {h || `Col ${i + 1}`}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {parsedData.slice(0, 5).map((row, rowIdx) => (
                                            <tr key={rowIdx} className="border-t">
                                                {headers.map((_, colIdx) => (
                                                    <td key={colIdx} className="px-3 py-2 truncate max-w-[150px]">
                                                        {row[colIdx] ?? ""}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {parsedData.length > 5 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    ... and {parsedData.length - 5} more rows
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={handleClose}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                        <Button
                            onClick={handleImport}
                            disabled={parsedData.length === 0}
                        >
                            <Check className="h-4 w-4 mr-2" />
                            Import {parsedData.length} Items
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
