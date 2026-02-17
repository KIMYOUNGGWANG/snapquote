"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Download, FileText, Copy, Trash2, Mail, AlertCircle } from "lucide-react"
import dynamic from "next/dynamic"
const EstimatePDF = dynamic(() => import("@/components/estimate-pdf").then(mod => mod.EstimatePDF), { ssr: false })
import { useRouter } from "next/navigation"
import { getEstimates, deleteEstimate, getProfile, updateEstimateStatus, updateEstimate, type LocalEstimate, type EstimateItem, type BusinessInfo } from "@/lib/estimates-storage"
import { toast } from "@/components/toast"
import { generateQuickBooksCSV, downloadCSV } from "@/lib/export-service"
const ConfirmDialog = dynamic(() => import("@/components/confirm-dialog").then(mod => mod.ConfirmDialog), { ssr: false })
const PDFPreviewModal = dynamic(() => import("@/components/pdf-preview-modal").then(mod => mod.PDFPreviewModal), { ssr: false })
const FollowUpModal = dynamic(() => import("@/components/follow-up-modal").then(mod => mod.FollowUpModal), { ssr: false })
import { Badge } from "@/components/ui/badge"
import { trackAnalyticsEvent } from "@/lib/analytics"

const PDFDownloadLink = dynamic(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
    {
        ssr: false,
        loading: () => <Button variant="outline" size="sm" disabled><Loader2 className="h-3 w-3 animate-spin" /></Button>,
    }
)

type TabType = 'drafts' | 'sent' | 'paid'

export default function HistoryPage() {
    const router = useRouter()
    const [estimates, setEstimates] = useState<LocalEstimate[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('drafts')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [estimateToDelete, setEstimateToDelete] = useState<string | null>(null)
    const [previewEstimate, setPreviewEstimate] = useState<LocalEstimate | null>(null)
    const [followUpEstimate, setFollowUpEstimate] = useState<LocalEstimate | null>(null)
    const [businessProfile, setBusinessProfile] = useState<BusinessInfo | undefined>(undefined)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const localEstimates = await getEstimates()
        setEstimates(localEstimates)
        const profile = getProfile()
        if (profile) setBusinessProfile(profile)
        setLoading(false)
    }

    // Filter estimates based on active tab
    const filteredEstimates = estimates.filter(e => {
        if (activeTab === 'drafts') {
            return e.status === 'draft' || !e.status  // Include legacy estimates
        }
        if (activeTab === 'sent') {
            return e.status === 'sent'
        }
        return e.status === 'paid'
    })

    // Count for badges
    const draftsCount = estimates.filter(e => e.status === 'draft' || !e.status).length
    const sentCount = estimates.filter(e => e.status === 'sent').length
    const paidCount = estimates.filter(e => e.status === 'paid').length

    // Count items with price TBD
    const getPriceTBDCount = (estimate: LocalEstimate): number => {
        return estimate.items?.filter(item => item.unit_price === 0).length || 0
    }

    const toggleExpand = (estimateId: string) => {
        setExpandedId(expandedId === estimateId ? null : estimateId)
    }

    const handleDuplicate = (estimate: LocalEstimate) => {
        const duplicateData = {
            items: estimate.items,
            summary_note: estimate.summary_note,
            clientName: estimate.clientName,
            clientAddress: estimate.clientAddress,
            taxRate: estimate.taxRate
        }
        localStorage.setItem('duplicate_estimate', JSON.stringify(duplicateData))
        router.push('/new-estimate')
    }

    const handleMarkAsSent = async (estimateId: string) => {
        const targetEstimate = estimates.find(est => est.id === estimateId)
        await updateEstimateStatus(estimateId, 'sent')
        if (targetEstimate) {
            void trackAnalyticsEvent({
                event: "quote_sent",
                estimateId: targetEstimate.id,
                estimateNumber: targetEstimate.estimateNumber,
                channel: "manual_status",
            })
        }
        await loadData()
        toast("✅ Marked as sent!", "success")
    }

    const handleMarkAsPaid = async (estimateId: string) => {
        const targetEstimate = estimates.find(est => est.id === estimateId)
        await updateEstimateStatus(estimateId, 'paid')
        if (targetEstimate) {
            void trackAnalyticsEvent({
                event: "payment_completed",
                estimateId: targetEstimate.id,
                estimateNumber: targetEstimate.estimateNumber,
                channel: "manual_status",
            })
        }
        await loadData()
        toast("💰 Marked as paid!", "success")
    }

    const handleConvertToInvoice = async (estimate: LocalEstimate) => {
        // Optimistic update
        await updateEstimate(estimate.id, {
            type: 'invoice',
            status: 'sent' // Ensure it's marked as sent/final
        })
        await loadData()
        toast("💰 Converted to Invoice!", "success")
    }

    const handleDeleteClick = (e: React.MouseEvent, estimateId: string) => {
        e.stopPropagation()
        e.preventDefault()
        setEstimateToDelete(estimateId)
        setDeleteDialogOpen(true)
    }

    const handleExportCSV = () => {
        if (estimates.length === 0) {
            toast("⚠️ No estimates to export.", "error")
            return
        }
        const csv = generateQuickBooksCSV(estimates)
        downloadCSV(csv, `snapquote_export_${new Date().toISOString().split('T')[0]}.csv`)
        toast("📊 Exported to CSV!", "success")
    }

    const handleConfirmDelete = async () => {
        if (estimateToDelete) {
            await deleteEstimate(estimateToDelete)
            await loadData()
            toast("✅ Estimate deleted", "success")
            setEstimateToDelete(null)
            setDeleteDialogOpen(false)
        }
    }

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>

    return (
        <div className="space-y-4 pb-20 max-w-2xl mx-auto px-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">Estimates</h1>
                <Button variant="outline" size="sm" onClick={handleExportCSV} title="Export for QuickBooks">
                    📊 Export CSV
                </Button>
            </div>

            {/* Tab Navigation */}
            <div className="flex p-1 bg-muted rounded-lg">
                <Button
                    variant={activeTab === 'drafts' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('drafts')}
                >
                    📝 Drafts
                    {draftsCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {draftsCount}
                        </Badge>
                    )}
                </Button>
                <Button
                    variant={activeTab === 'sent' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('sent')}
                >
                    ✅ Sent
                    {sentCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {sentCount}
                        </Badge>
                    )}
                </Button>
                <Button
                    variant={activeTab === 'paid' ? 'default' : 'ghost'}
                    className="flex-1 rounded-md h-10"
                    onClick={() => setActiveTab('paid')}
                >
                    💰 Paid
                    {paidCount > 0 && (
                        <Badge variant="secondary" className="ml-2">
                            {paidCount}
                        </Badge>
                    )}
                </Button>
            </div>

            {filteredEstimates.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="font-medium text-lg mb-2">
                            {activeTab === 'drafts'
                                ? 'No drafts yet'
                                : (activeTab === 'sent' ? 'No sent estimates' : 'No paid estimates')}
                        </h3>
                        <p className="text-muted-foreground text-sm mb-4">
                            {activeTab === 'drafts'
                                ? 'Create a new estimate to get started'
                                : (activeTab === 'sent'
                                    ? 'Drafts will appear here after you send them'
                                    : 'Paid estimates will appear here after successful payment')}
                        </p>
                        {activeTab === 'drafts' && (
                            <Button onClick={() => router.push("/new-estimate")}>
                                Create New Estimate
                            </Button>
                        )}
                    </CardContent>
                </Card>
            ) : (
                filteredEstimates.map((estimate) => {
                    const isExpanded = expandedId === estimate.id
                    const items = estimate.items || []
                    const priceTBDCount = getPriceTBDCount(estimate)

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
                                    <div className="flex items-center gap-2">
                                        {priceTBDCount > 0 && activeTab === 'drafts' && (
                                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                                                <AlertCircle className="h-3 w-3 mr-1" />
                                                {priceTBDCount} TBD
                                            </Badge>
                                        )}
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${estimate.status === 'paid'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : (estimate.status === 'sent'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-yellow-100 text-yellow-800')
                                            }`}>
                                            {estimate.type === 'invoice'
                                                ? 'INVOICE'
                                                : (estimate.status === 'paid'
                                                    ? 'PAID'
                                                    : (estimate.status === 'sent' ? 'SENT' : 'DRAFT'))}
                                        </span>
                                    </div>
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
                                            <div key={idx} className={`flex justify-between text-sm ${item.unit_price === 0 ? 'bg-yellow-50 p-2 rounded border border-yellow-200' : ''}`}>
                                                <div>
                                                    <p className="font-medium">{item.description}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Qty: {item.quantity} × ${item.unit_price.toFixed(2)}
                                                        {item.unit_price === 0 && <span className="ml-2 text-yellow-600">⚠️ Price TBD</span>}
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

                                        {/* Attachments Section - Dispute Prevention */}
                                        {estimate.attachments && (estimate.attachments.photos?.length > 0 || estimate.attachments.originalTranscript) && (
                                            <div className="pt-3 border-t mt-3">
                                                <p className="text-sm font-medium text-muted-foreground mb-2">📎 Original Data</p>

                                                {/* Photos */}
                                                {estimate.attachments.photos && estimate.attachments.photos.length > 0 && (
                                                    <div className="mb-2">
                                                        <p className="text-xs text-muted-foreground mb-1">Photos ({estimate.attachments.photos.length})</p>
                                                        <div className="flex gap-2 overflow-x-auto">
                                                            {estimate.attachments.photos.map((url, i) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    key={i}
                                                                    src={url}
                                                                    alt={`Attachment ${i + 1}`}
                                                                    className="h-16 w-16 object-cover rounded border"
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Transcript */}
                                                {estimate.attachments.originalTranscript && (
                                                    <div>
                                                        <p className="text-xs text-muted-foreground mb-1">🎤 Original Transcript</p>
                                                        <p className="text-xs bg-muted p-2 rounded italic">
                                                            &ldquo;{estimate.attachments.originalTranscript}&rdquo;
                                                        </p>
                                                    </div>
                                                )}
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
                                        {isExpanded ? "Hide" : "Details"}
                                    </Button>

                                    {/* Mark as Sent button - only for drafts */}
                                    {activeTab === 'drafts' && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsSent(estimate.id)}
                                        >
                                            ✅ Mark Sent
                                        </Button>
                                    )}

                                    {activeTab === 'sent' && estimate.status === 'sent' && (
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleMarkAsPaid(estimate.id)}
                                        >
                                            💰 Mark Paid
                                        </Button>
                                    )}

                                    {/* Convert to Invoice - only for sent estimates that aren't already invoices */}
                                    {estimate.status === 'sent' && estimate.type !== 'invoice' && (
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => handleConvertToInvoice(estimate)}
                                        >
                                            💰 To Invoice
                                        </Button>
                                    )}

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleDuplicate(estimate)}
                                    >
                                        <Copy className="h-3 w-3 mr-1" />
                                        Duplicate
                                    </Button>
                                    {estimate.status !== 'paid' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setFollowUpEstimate(estimate)}
                                        >
                                            <Mail className="h-3 w-3 mr-1" />
                                            Follow-up
                                        </Button>
                                    )}
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
                                                        business={businessProfile}


                                                        templateUrl={businessProfile?.estimate_template_url}
                                                        photos={estimate.attachments?.photos}
                                                        type={estimate.type}
                                                        paymentLink={businessProfile?.payment_link}
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

            {
                previewEstimate && (
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
                                business={businessProfile}
                                templateUrl={businessProfile?.estimate_template_url}
                                photos={previewEstimate.attachments?.photos}
                                type={previewEstimate.type}
                                paymentLink={businessProfile?.payment_link}
                            />
                        }
                        fileName={`${previewEstimate.estimateNumber || 'estimate'}.pdf`}
                    />
                )
            }

            {
                followUpEstimate && (
                    <FollowUpModal
                        open={!!followUpEstimate}
                        onClose={() => setFollowUpEstimate(null)}
                        clientName={followUpEstimate.clientName}
                        estimateNumber={followUpEstimate.estimateNumber}
                        totalAmount={followUpEstimate.totalAmount}
                        businessName={businessProfile?.business_name || ""}
                    />
                )
            }
        </div >
    )
}
