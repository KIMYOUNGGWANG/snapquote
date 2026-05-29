"use client"

import { FileSpreadsheet, Plus, Receipt, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { EstimateItem } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import { toSafeNumber, type EstimateDraft } from "@/lib/estimates/normalize"

type EstimateItemChangeHandler = (
    index: number,
    field: keyof EstimateItem,
    value: string | number | boolean
) => void

type SectionItemChangeHandler = (
    sectionId: string,
    itemIndex: number,
    field: keyof EstimateItem,
    value: string | number | boolean
) => void

type EstimateLineItemsEditorProps = {
    estimate: EstimateDraft
    onAddItem: () => void
    onAddItemToSection: (sectionId: string) => void
    onAddSection: () => void
    onDeleteItem: (index: number) => void
    onDeleteSection: (sectionId: string) => void
    onDeleteSectionItem: (sectionId: string, itemIndex: number) => void
    onEditSectionName: (sectionId: string, name: string) => void
    onItemChange: EstimateItemChangeHandler
    onOpenExcelImport: () => void
    onScanReceipt: () => void
    onSectionItemChange: SectionItemChangeHandler
    onTaxRateChange: (taxRate: number) => void
    resultSubtotal: number
    resultTotal: number
    taxRate: number
}

const ITEM_UNIT_OPTIONS = ["ea", "LS", "hr", "day", "SF", "LF", "%", "other"]
const SECTION_UNIT_OPTIONS = ["ea", "LS", "hr", "day", "SF", "LF"]

export function EstimateLineItemsEditor({
    estimate,
    onAddItem,
    onAddItemToSection,
    onAddSection,
    onDeleteItem,
    onDeleteSection,
    onDeleteSectionItem,
    onEditSectionName,
    onItemChange,
    onOpenExcelImport,
    onScanReceipt,
    onSectionItemChange,
    onTaxRateChange,
    resultSubtotal,
    resultTotal,
    taxRate,
}: EstimateLineItemsEditorProps) {
    const allItems = getAllItemsFromEstimate(estimate)
    const itemCount = allItems.length
    const taxAmount = resultSubtotal * taxRate / 100
    const missingDescriptionCount = allItems.filter((item) => item.description.trim().length === 0).length
    const missingPriceCount = allItems.filter((item) => toSafeNumber(item.unit_price, 0) <= 0 || lineTotal(item) <= 0).length
    const missingQuantityCount = allItems.filter((item) => toSafeNumber(item.quantity, 0) <= 0).length

    return (
        <>
            <EstimateReviewSummary
                itemCount={itemCount}
                missingDescriptionCount={missingDescriptionCount}
                missingPriceCount={missingPriceCount}
                missingQuantityCount={missingQuantityCount}
                resultSubtotal={resultSubtotal}
                resultTotal={resultTotal}
                taxAmount={taxAmount}
            />

            <div className="space-y-3" data-testid="line-items-editing-block">
                <FlatEstimateItems
                    items={estimate.items || []}
                    onDeleteItem={onDeleteItem}
                    onItemChange={onItemChange}
                />

                <div className="grid grid-cols-2 gap-2">
                    <Button
                        variant="outline"
                        className="h-11 justify-center rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                        onClick={onScanReceipt}
                    >
                        <Receipt className="mr-2 h-4 w-4 shrink-0" />
                        Scan Receipt
                    </Button>
                    <Button
                        variant="outline"
                        className="h-11 justify-center rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                        onClick={onAddItem}
                    >
                        <Plus className="mr-2 h-4 w-4 shrink-0" />
                        Add Item
                    </Button>
                    <Button
                        variant="outline"
                        className="h-11 justify-center rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                        onClick={onAddSection}
                    >
                        <Plus className="mr-2 h-4 w-4 shrink-0" />
                        Section
                    </Button>
                    <Button
                        variant="outline"
                        className="h-11 justify-center rounded-lg border-white/10 bg-slate-950/70 px-3 text-sm text-white hover:bg-slate-900"
                        onClick={onOpenExcelImport}
                    >
                        <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" />
                        CSV
                    </Button>
                </div>

                {estimate.sections && estimate.sections.length > 0 ? (
                    <div className="mt-4 space-y-4">
                        {estimate.sections.map((section) => (
                            <EstimateSectionEditor
                                key={section.id}
                                onAddItem={() => onAddItemToSection(section.id)}
                                onDelete={() => onDeleteSection(section.id)}
                                onDeleteItem={(itemIndex) => onDeleteSectionItem(section.id, itemIndex)}
                                onItemChange={(itemIndex, field, value) => onSectionItemChange(section.id, itemIndex, field, value)}
                                onNameChange={(name) => onEditSectionName(section.id, name)}
                                section={section}
                            />
                        ))}
                    </div>
                ) : null}

                <EstimateTotals
                    estimate={estimate}
                    onTaxRateChange={onTaxRateChange}
                    resultSubtotal={resultSubtotal}
                    resultTotal={resultTotal}
                    taxRate={taxRate}
                />
            </div>
        </>
    )
}

function EstimateReviewSummary({
    itemCount,
    missingDescriptionCount,
    missingPriceCount,
    missingQuantityCount,
    resultSubtotal,
    resultTotal,
    taxAmount,
}: {
    itemCount: number
    missingDescriptionCount: number
    missingPriceCount: number
    missingQuantityCount: number
    resultSubtotal: number
    resultTotal: number
    taxAmount: number
}) {
    const totalReviewIssues = missingDescriptionCount + missingPriceCount + missingQuantityCount
    const reviewStatusLabel = totalReviewIssues === 0
        ? "Ready for customer copy"
        : `${totalReviewIssues} ${totalReviewIssues === 1 ? "fix" : "fixes"} before sending`
    const pricingStatusLabel = missingPriceCount === 0
        ? "Checked"
        : `${missingPriceCount} ${missingPriceCount === 1 ? "zero price" : "zero prices"}`
    const checklistItems = [
        {
            label: "Descriptions",
            value: missingDescriptionCount === 0 ? "Checked" : `${missingDescriptionCount} missing`,
            isReady: missingDescriptionCount === 0,
            testId: "line-review-description-status",
        },
        {
            label: "Pricing",
            value: pricingStatusLabel,
            isReady: missingPriceCount === 0,
            testId: "line-review-pricing-status",
        },
        {
            label: "Qty",
            value: missingQuantityCount === 0 ? "Checked" : `${missingQuantityCount} missing`,
            isReady: missingQuantityCount === 0,
            testId: "line-review-quantity-status",
        },
    ]

    return (
        <div className="field-card space-y-2 p-2.5 sm:space-y-3 sm:p-3" data-testid="line-items-review-summary">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Line item review</p>
                    <p className="mt-1 text-sm font-semibold text-white" data-testid="line-items-count">
                        {itemCount} {itemCount === 1 ? "item" : "items"} ready to verify
                    </p>
                </div>
                <div className="rounded-lg border border-blue-300/25 bg-blue-500/10 px-2.5 py-1.5 text-right sm:px-3 sm:py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-200/80">Total</p>
                    <p className="text-lg font-bold text-blue-100">${resultTotal.toFixed(2)}</p>
                </div>
            </div>
            <div
                className={`rounded-lg border px-2.5 py-2 ${totalReviewIssues === 0 ? "border-emerald-300/25 bg-emerald-400/10" : "border-amber-300/25 bg-amber-400/10"}`}
                data-testid="line-review-quality-gate"
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Review gate</p>
                    <p
                        className={`truncate text-xs font-semibold ${totalReviewIssues === 0 ? "text-emerald-100" : "text-amber-100"}`}
                        data-testid="line-review-status"
                    >
                        {reviewStatusLabel}
                    </p>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5" data-testid="line-review-checklist">
                    {checklistItems.map((item) => (
                        <div key={item.label} className="min-w-0 rounded-md border border-white/10 bg-slate-950/55 px-2 py-1.5">
                            <p className="truncate text-[10px] font-semibold text-slate-500">{item.label}</p>
                            <p
                                className={`mt-0.5 truncate text-xs font-semibold ${item.isReady ? "text-emerald-200" : "text-amber-200"}`}
                                data-testid={item.testId}
                            >
                                {item.value}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-1.5 sm:p-2">
                    <p className="text-slate-400">Subtotal</p>
                    <p className="font-semibold text-white sm:mt-1">${resultSubtotal.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-1.5 sm:p-2">
                    <p className="text-slate-400">Tax</p>
                    <p className="font-semibold text-white sm:mt-1">${taxAmount.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-slate-950/60 p-1.5 sm:p-2">
                    <p className="text-slate-400">Lines</p>
                    <p className="font-semibold text-white sm:mt-1">{itemCount}</p>
                </div>
            </div>
        </div>
    )
}

function FlatEstimateItems({
    items,
    onDeleteItem,
    onItemChange,
}: {
    items: EstimateItem[]
    onDeleteItem: (index: number) => void
    onItemChange: EstimateItemChangeHandler
}) {
    return (
        <div className="space-y-3" data-testid="flat-line-items-list">
            {items.map((item, index) => (
                <FlatEstimateItemRow
                    index={index}
                    item={item}
                    key={item.id || index}
                    onDelete={() => onDeleteItem(index)}
                    onItemChange={onItemChange}
                />
            ))}
        </div>
    )
}

function FlatEstimateItemRow({
    index,
    item,
    onDelete,
    onItemChange,
}: {
    index: number
    item: EstimateItem
    onDelete: () => void
    onItemChange: EstimateItemChangeHandler
}) {
    const currentCategory = item.category || "PARTS"
    const currentUnit = item.unit || "ea"
    const itemTotal = lineTotal(item)

    return (
        <div className="field-card flex flex-col gap-2 p-2.5 sm:gap-3 sm:p-3" data-testid={`line-item-row-${index}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-950/70 font-mono text-xs text-slate-400">
                        #{item.itemNumber || index + 1}
                    </span>
                    <select
                        value={currentCategory}
                        onChange={(event) => onItemChange(index, "category", event.target.value)}
                        className="h-11 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-2 text-xs font-medium text-slate-100 sm:flex-none"
                        data-testid={`line-item-category-${index}`}
                        aria-label={`Line item ${index + 1} category`}
                    >
                        <option value="PARTS">Parts</option>
                        <option value="LABOR">Labor</option>
                        <option value="SERVICE">Service</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <div className="min-w-[72px] rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Line</p>
                        <p className="text-sm font-bold text-white">${itemTotal.toFixed(2)}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-destructive hover:text-destructive"
                        onClick={onDelete}
                        aria-label={`Delete line item ${index + 1}`}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            <Textarea
                value={item.description}
                onChange={(event) => onItemChange(index, "description", event.target.value)}
                className="scroll-mb-32 scroll-mt-4 min-h-[56px] w-full resize-none rounded-md border-white/10 bg-slate-950 px-3 py-2 font-medium leading-5 text-white focus-visible:ring-1 sm:min-h-[68px]"
                data-testid={`line-item-description-${index}`}
                aria-label={`Line item ${index + 1} description`}
                placeholder="Item Description"
            />
            <div className="grid grid-cols-[0.72fr_0.82fr_0.9fr_1.2fr] gap-1.5 sm:gap-2" data-testid={`line-item-meta-grid-${index}`}>
                <div className="min-w-0">
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Qty</label>
                    <Input
                        type="number"
                        value={item.quantity}
                        onChange={(event) => onItemChange(index, "quantity", event.target.value)}
                        className="h-11 rounded-md border-white/10 bg-slate-950 px-2 text-sm text-white"
                        data-testid={`line-item-quantity-${index}`}
                        aria-label={`Line item ${index + 1} quantity`}
                    />
                </div>
                <div className="min-w-0">
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Unit</label>
                    <select
                        value={currentUnit}
                        onChange={(event) => onItemChange(index, "unit", event.target.value)}
                        className="h-11 w-full rounded-md border border-white/10 bg-slate-950 px-2 text-xs text-slate-100"
                        data-testid={`line-item-unit-${index}`}
                        aria-label={`Line item ${index + 1} unit`}
                    >
                        {ITEM_UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
                <div className="min-w-0">
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Unit $</label>
                    <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(event) => onItemChange(index, "unit_price", event.target.value)}
                        className="h-11 rounded-md border-white/10 bg-slate-950 px-2 text-sm text-white"
                        data-testid={`line-item-unit-price-${index}`}
                        aria-label={`Line item ${index + 1} unit price`}
                    />
                </div>
                <div className="min-w-0 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right">
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Total</label>
                    <p
                        className="whitespace-nowrap text-[13px] font-bold leading-5 text-white sm:text-base"
                        data-testid={`line-item-meta-total-${index}`}
                    >
                        ${itemTotal.toFixed(2)}
                    </p>
                </div>
            </div>
        </div>
    )
}

function EstimateSectionEditor({
    onAddItem,
    onDelete,
    onDeleteItem,
    onItemChange,
    onNameChange,
    section,
}: {
    onAddItem: () => void
    onDelete: () => void
    onDeleteItem: (itemIndex: number) => void
    onItemChange: (itemIndex: number, field: keyof EstimateItem, value: string | number | boolean) => void
    onNameChange: (name: string) => void
    section: NonNullable<EstimateDraft["sections"]>[number]
}) {
    const sectionItems = section.items || []
    const sectionSubtotal = sectionItems.reduce((sum, item) => sum + lineTotal(item), 0)

    return (
        <div className="rounded-lg border border-blue-400/30 bg-blue-500/10 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
                <Input
                    value={section.name}
                    onChange={(event) => onNameChange(event.target.value)}
                    className="h-11 min-w-0 flex-1 border-0 border-b border-blue-300/30 bg-transparent px-0 font-semibold text-blue-100 focus-visible:ring-0"
                    placeholder="Section Name"
                    aria-label={`Section ${section.name || "untitled"} name`}
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={onDelete}
                    aria-label={`Delete ${section.name || "untitled"} section`}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="space-y-2">
                {sectionItems.map((item, itemIndex) => (
                    <SectionEstimateItemRow
                        item={item}
                        itemIndex={itemIndex}
                        key={item.id || itemIndex}
                        onDelete={() => onDeleteItem(itemIndex)}
                        onItemChange={onItemChange}
                    />
                ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-blue-300/20 pt-2">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary"
                    onClick={onAddItem}
                    aria-label={`Add item to ${section.name || "untitled"} section`}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                </Button>
                <div className="text-sm font-semibold text-blue-100">
                    Subtotal: ${sectionSubtotal.toFixed(2)}
                </div>
            </div>
        </div>
    )
}

function SectionEstimateItemRow({
    item,
    itemIndex,
    onDelete,
    onItemChange,
}: {
    item: EstimateItem
    itemIndex: number
    onDelete: () => void
    onItemChange: (itemIndex: number, field: keyof EstimateItem, value: string | number | boolean) => void
}) {
    const currentCategory = item.category || "PARTS"
    const currentUnit = item.unit || "ea"
    const itemTotal = lineTotal(item)

    return (
        <div className="flex flex-col gap-3 border-b border-blue-300/20 py-3 last:border-0">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-blue-300/20 bg-slate-950/70 font-mono text-xs text-slate-400">#{item.itemNumber || itemIndex + 1}</span>
                    <select
                        value={currentCategory}
                        onChange={(event) => onItemChange(itemIndex, "category", event.target.value)}
                        className="h-11 min-w-[112px] rounded-md border border-white/10 bg-slate-950 px-2 text-xs font-medium text-slate-100"
                        data-testid={`section-line-item-category-${itemIndex}`}
                        aria-label={`Section line item ${itemIndex + 1} category`}
                    >
                        <option value="PARTS">Parts</option>
                        <option value="LABOR">Labor</option>
                        <option value="SERVICE">Service</option>
                        <option value="OTHER">Other</option>
                    </select>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <div className="min-w-[76px] rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right">
                        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Line</p>
                        <p className="text-sm font-bold text-white">${itemTotal.toFixed(2)}</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-destructive"
                        onClick={onDelete}
                        aria-label={`Delete section line item ${itemIndex + 1}`}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            <Textarea
                value={item.description}
                onChange={(event) => onItemChange(itemIndex, "description", event.target.value)}
                className="scroll-mb-32 scroll-mt-4 min-h-[68px] resize-none rounded-md border-white/10 bg-slate-950 px-3 py-2 text-sm leading-5 text-white"
                placeholder="Description"
                data-testid={`section-line-item-description-${itemIndex}`}
                aria-label={`Section line item ${itemIndex + 1} description`}
            />
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Qty</label>
                    <Input
                        type="number"
                        value={item.quantity}
                        onChange={(event) => onItemChange(itemIndex, "quantity", event.target.value)}
                        className="h-11 rounded-md border-white/10 bg-slate-950 text-white"
                        placeholder="Qty"
                        data-testid={`section-line-item-quantity-${itemIndex}`}
                        aria-label={`Section line item ${itemIndex + 1} quantity`}
                    />
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Unit</label>
                    <select
                        value={currentUnit}
                        onChange={(event) => onItemChange(itemIndex, "unit", event.target.value)}
                        className="h-11 w-full rounded-md border border-white/10 bg-slate-950 px-2 text-xs text-slate-100"
                        data-testid={`section-line-item-unit-${itemIndex}`}
                        aria-label={`Section line item ${itemIndex + 1} unit`}
                    >
                        {SECTION_UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Unit $</label>
                    <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(event) => onItemChange(itemIndex, "unit_price", event.target.value)}
                        className="h-11 rounded-md border-white/10 bg-slate-950 text-white"
                        placeholder="$"
                        data-testid={`section-line-item-unit-price-${itemIndex}`}
                        aria-label={`Section line item ${itemIndex + 1} unit price`}
                    />
                </div>
                <div className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right">
                    <label className="text-[10px] uppercase tracking-[0.12em] text-slate-400">Total</label>
                    <p className="font-bold text-white">
                        ${itemTotal.toFixed(2)}
                    </p>
                </div>
            </div>
        </div>
    )
}

function EstimateTotals({
    estimate,
    onTaxRateChange,
    resultSubtotal,
    resultTotal,
    taxRate,
}: {
    estimate: EstimateDraft
    onTaxRateChange: (taxRate: number) => void
    resultSubtotal: number
    resultTotal: number
    taxRate: number
}) {
    const subtotal = getAllItemsFromEstimate(estimate).reduce((sum, item) => sum + lineTotal(item), 0)

    return (
        <div className="field-card space-y-2 border-t border-white/10 p-3">
            <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="text-white">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                    <span className="text-slate-400">Tax</span>
                    <Input
                        type="number"
                        value={taxRate}
                        onChange={(event) => onTaxRateChange(Number(event.target.value))}
                        className="h-11 w-20 rounded-md border-white/10 bg-slate-950 text-center text-sm text-white"
                        aria-label="Tax rate percentage"
                    />
                    <span className="text-xs text-slate-400">%</span>
                </div>
                <span className="text-white">${(resultSubtotal * taxRate / 100).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-2">
                <p className="text-lg font-bold text-white">Total</p>
                <p className="text-xl font-bold text-blue-300">
                    ${resultTotal.toFixed(2)}
                </p>
            </div>
        </div>
    )
}
