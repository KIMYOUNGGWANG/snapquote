"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail } from "lucide-react"
import dynamic from "next/dynamic"
import { EstimatePDF } from "@/components/estimate-pdf"
import { useRouter } from "next/navigation"
import { getEstimates, deleteEstimate, getProfile, type LocalEstimate, type EstimateItem } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PDFPreviewModal } from "@/components/pdf-preview-modal"
import { FollowUpModal } from "@/components/follow-up-modal"

const PDFDownloadLink = dynamic(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
    {
        ssr: false,
        loading: () => <Button variant="outline" size="sm" disabled><Loader2 className="h-3 w-3 animate-spin" /></Button>,
    }
)

export default function HistoryPage() {
    const router = useRouter()
    const [estimates, setEstimates] = useState<LocalEstimate[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null)
    const [previewEstimate, setPreviewEstimate] = useState<LocalEstimate | null>(null)
    const [followUpEstimate, setFollowUpEstimate] = useState<LocalEstimate | null>(null)
    const [businessName, setBusinessName] = useState("")

    useEffect(() => {
        // Load estimates from IndexedDB
        const loadData = async () => {
            const localEstimates = await getEstimates()
            setEstimates(localEstimates)

            // Load business name for follow-up emails
            const profile = getProfile()
            if (profile?.business_name) {
                setBusinessName(profile.business_name)
            }

            setLoading(false)
        }
        loadData()
    }, [])

    const toggleExpand = (estimateId: string) => {
        if (expandedId === estimateId) {
            setExpandedId(null)
        } else {
            setExpandedId(estimateId)
        }
    }

    const handleDuplicate = (estimate: LocalEstimate) => {
        // Save to localStorage for new-estimate page to pick up
        const duplicateData = {
            items: estimate.items,
            summary_note: estimate.summary_note,
            clientName: estimate.clientName,
            clientAddress: estimate.clientAddress,
            taxRate: estimate.taxRate
        }
        localStorage.setItem('duplicate_estimate', JSON.stringify(duplicateData))

        // Navigate to new estimate page
        router.push('/new-estimate')
    }

    const handleDeleteClick = (e: React.MouseEvent, estimateId: string) => {
        e.stopPropagation()
        e.preventDefault()
        setEstimateToDelete(estimateId)
        setDeleteDialogOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (estimateToDelete) {
            await deleteEstimate(estimateToDelete)
            const updatedEstimates = await getEstimates()
            setEstimates(updatedEstimates)
            toast(`✅ Estimate deleted (${updatedEstimates.length} remaining)`, "success")
            setEstimateToDelete(null)
            setDeleteDialogOpen(false) // Close dialog after deletion
        }
    }

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>

    return (
        <div className="space-y-4 pb-20 max-w-2xl mx-auto px-4">
            <h1 className="text-2xl font-bold">Estimate History</h1>
            {estimates.length === 0 ? (
                <p className="text-muted-foreground">No estimates yet.</p>
            ) : (
                estimates.map((estimate) => {
                    const isExpanded = expandedId === estimate.id
                    const items = estimate.items || []
                    return (
                        <Card key={estimate.id}>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CardTitle className="text-lg">{estimate.clientName || "Client"}</CardTitle>
                                            {estimate.estimateNumber && (
                                                <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                                                    {estimate.estimateNumber}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {new Date(estimate.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className="px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-green-100 text-green-800">
                                        SAVED
                                    </span>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div>
                                    <p className="font-bold text-lg">${estimate.totalAmount.toFixed(2)}</p>
                                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                        {estimate.summary_note}
                                    </p>
                                </div>

                                {/* Expanded Items */}
                                {isExpanded && items.length > 0 && (
                                    <div className="pt-3 border-t space-y-2">
                                        {items.map((item: EstimateItem, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <div>
                                                    <p className="font-medium">{item.description}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Qty: {item.quantity} × ${item.unit_price.toFixed(2)}
                                                    </p>
                                                </div>
                                                <p className="font-semibold">${item.total.toFixed(2)}</p>
                                            </div>
                                        ))}
                                        {estimate.taxAmount > 0 && (
                                            <div className="pt-2 border-t">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Subtotal</span>
                                                    <span>${(estimate.totalAmount - estimate.taxAmount).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Tax ({estimate.taxRate}%)</span>
                                                    <span>${estimate.taxAmount.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => toggleExpand(estimate.id)}
                                    >
                                        <FileText className="h-3 w-3 mr-1" />
                                        {isExpanded ? "Hide Details" : "View Details"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDuplicate(estimate)}
                                    >
                                        <Copy className="h-3 w-3 mr-1" />
                                        Duplicate
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setFollowUpEstimate(estimate)}
                                    >
                                        <Mail className="h-3 w-3 mr-1" />
                                        Follow-up
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={(e) => handleDeleteClick(e, estimate.id)}
                                    >
                                        <Trash2 className="h-3 w-3 mr-1" />
                                        Delete
                                    </Button>
                                    {items.length > 0 && (
                                        <>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPreviewEstimate(estimate)}
                                            >
                                                👁️
                                            </Button>
                                            <PDFDownloadLink
                                                document={
                                                    <EstimatePDF
                                                        items={items}
                                                        total={estimate.totalAmount}
                                                        summary={estimate.summary_note}
                                                        taxRate={estimate.taxRate || 0}
                                                        client={{
                                                            name: estimate.clientName,
                                                            address: estimate.clientAddress
                                                        }}
                                                    />
                                                }
                                                fileName={`${estimate.estimateNumber || 'estimate'}.pdf`}
                                            >
                                                {({ loading }) => (
                                                    <Button variant="secondary" size="sm" disabled={loading}>
                                                        <Download className="h-3 w-3 mr-1" />
                                                        PDF
                                                    </Button>
                                                )}
                                            </PDFDownloadLink>
                                        </>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })
            )}

            <ConfirmDialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Estimate"
                description="Are you sure you want to delete this estimate? This action cannot be undone."
            />

            {previewEstimate && (
                <PDFPreviewModal
                    open={!!previewEstimate}
                    onClose={() => setPreviewEstimate(null)}
                    document={
                        <EstimatePDF
                            items={previewEstimate.items}
                            total={previewEstimate.totalAmount}
                            summary={previewEstimate.summary_note}
                            taxRate={previewEstimate.taxRate || 0}
                            client={{
                                name: previewEstimate.clientName,
                                address: previewEstimate.clientAddress
                            }}
                        />
                    }
                />
            )}

            {followUpEstimate && (
                <FollowUpModal
                    open={!!followUpEstimate}
                    onClose={() => setFollowUpEstimate(null)}
                    clientName={followUpEstimate.clientName}
                    estimateNumber={followUpEstimate.estimateNumber}
                    totalAmount={followUpEstimate.totalAmount}
                    businessName={businessName}
                />
            )}
        </div>
    )
}
