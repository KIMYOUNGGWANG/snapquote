"use client"

import { FileSpreadsheet, Plus, Receipt, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PriceListAutocomplete } from "@/components/pricelist-autocomplete"
import type { EstimateItem } from "@/lib/estimates-storage"
import { getAllItemsFromEstimate, lineTotal } from "@/lib/estimates/math"
import type { EstimateDraft } from "@/lib/estimates/normalize"

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
    return (
        <>
            <FlatEstimateItems
                items={estimate.items || []}
                onDeleteItem={onDeleteItem}
                onItemChange={onItemChange}
            />

            <div className="flex gap-2 flex-wrap">
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onScanReceipt}
                >
                    <Receipt className="h-4 w-4 mr-2" />
                    Scan Receipt
                </Button>
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onAddItem}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Item
                </Button>
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onAddSection}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    📁 Section
                </Button>
                <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onOpenExcelImport}
                >
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    📊 CSV
                </Button>
            </div>

            {estimate.sections && estimate.sections.length > 0 ? (
                <div className="space-y-4 mt-4">
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
        </>
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
        <div className="space-y-4">
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

    return (
        <div className="flex flex-col gap-2 py-3 border-b last:border-0">
            <div className="flex items-start gap-2">
                <span className="w-6 h-9 flex items-center justify-center text-xs font-mono text-muted-foreground">
                    #{item.itemNumber || index + 1}
                </span>
                <select
                    value={currentCategory}
                    onChange={(event) => onItemChange(index, "category", event.target.value)}
                    className="h-9 px-2 rounded-md border bg-white text-xs font-medium text-gray-700 shrink-0"
                >
                    <option value="PARTS">🔧 Parts</option>
                    <option value="LABOR">👷 Labor</option>
                    <option value="SERVICE">📋 Service</option>
                    <option value="OTHER">📦 Other</option>
                </select>
                <PriceListAutocomplete
                    value={item.description}
                    onChange={(value) => onItemChange(index, "description", value)}
                    onSelect={(priceItem) => {
                        onItemChange(index, "description", priceItem.name)
                        onItemChange(index, "unit_price", priceItem.price)
                        onItemChange(index, "unit", priceItem.unit)
                        onItemChange(index, "category", priceItem.category)
                    }}
                    placeholder="Item Description"
                    className="flex-1"
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={onDelete}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="flex gap-2 items-center ml-8">
                <div className="w-16">
                    <label className="text-[10px] text-muted-foreground">Qty</label>
                    <Input
                        type="number"
                        value={item.quantity}
                        onChange={(event) => onItemChange(index, "quantity", event.target.value)}
                        className="h-8 text-gray-900 bg-white border"
                    />
                </div>
                <div className="w-20">
                    <label className="text-[10px] text-muted-foreground">Unit</label>
                    <select
                        value={currentUnit}
                        onChange={(event) => onItemChange(index, "unit", event.target.value)}
                        className="w-full h-8 px-2 rounded-md border bg-white text-xs text-gray-700"
                    >
                        {ITEM_UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                        ))}
                    </select>
                </div>
                <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground">Unit $ ({currentUnit})</label>
                    <Input
                        type="number"
                        value={item.unit_price}
                        onChange={(event) => onItemChange(index, "unit_price", event.target.value)}
                        className="h-8 text-gray-900 bg-white border"
                    />
                </div>
                <div className="w-24 text-right">
                    <label className="text-[10px] text-muted-foreground">Total</label>
                    <p className="font-bold py-1">
                        ${lineTotal(item).toFixed(2)}
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
        <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-lg">📁</span>
                    <Input
                        value={section.name}
                        onChange={(event) => onNameChange(event.target.value)}
                        className="font-semibold text-primary bg-transparent border-0 border-b focus-visible:ring-0 px-0 h-7"
                        placeholder="Section Name"
                    />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive h-7 px-2"
                    onClick={onDelete}
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

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-primary/20">
                <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary h-7"
                    onClick={onAddItem}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                </Button>
                <div className="text-sm font-semibold text-primary">
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

    return (
        <div className="flex flex-col gap-1 py-2 border-b border-primary/20 last:border-0">
            <div className="flex items-center gap-2">
                <span className="w-5 text-xs font-mono text-muted-foreground">#{item.itemNumber || itemIndex + 1}</span>
                <select
                    value={currentCategory}
                    onChange={(event) => onItemChange(itemIndex, "category", event.target.value)}
                    className="h-8 px-2 rounded-md border bg-white text-xs font-medium text-gray-700"
                >
                    <option value="PARTS">🔧</option>
                    <option value="LABOR">👷</option>
                    <option value="SERVICE">📋</option>
                    <option value="OTHER">📦</option>
                </select>
                <PriceListAutocomplete
                    value={item.description}
                    onChange={(value) => onItemChange(itemIndex, "description", value)}
                    onSelect={(priceItem) => {
                        onItemChange(itemIndex, "description", priceItem.name)
                        onItemChange(itemIndex, "unit_price", priceItem.price)
                        onItemChange(itemIndex, "unit", priceItem.unit)
                        onItemChange(itemIndex, "category", priceItem.category)
                    }}
                    placeholder="Description"
                    className="flex-1"
                />
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={onDelete}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="flex gap-2 ml-5">
                <Input
                    type="number"
                    value={item.quantity}
                    onChange={(event) => onItemChange(itemIndex, "quantity", event.target.value)}
                    className="w-16 h-7 text-xs bg-white"
                    placeholder="Qty"
                />
                <select
                    value={currentUnit}
                    onChange={(event) => onItemChange(itemIndex, "unit", event.target.value)}
                    className="w-16 h-7 px-1 rounded-md border bg-white text-xs"
                >
                    {SECTION_UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>{unit}</option>
                    ))}
                </select>
                <Input
                    type="number"
                    value={item.unit_price}
                    onChange={(event) => onItemChange(itemIndex, "unit_price", event.target.value)}
                    className="w-20 h-7 text-xs bg-white"
                    placeholder="$"
                />
                <span className="text-sm font-semibold w-20 text-right">
                    ${lineTotal(item).toFixed(2)}
                </span>
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
        <div className="space-y-2 pt-4 border-t">
            <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Tax</span>
                    <Input
                        type="number"
                        value={taxRate}
                        onChange={(event) => onTaxRateChange(Number(event.target.value))}
                        className="w-16 h-6 text-xs text-center"
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                </div>
                <span>${(resultSubtotal * taxRate / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
                <p className="font-bold text-lg">Total</p>
                <p className="font-bold text-xl text-primary">
                    ${resultTotal.toFixed(2)}
                </p>
            </div>
        </div>
    )
}
