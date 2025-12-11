"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, X, Download } from "lucide-react"

interface PDFPreviewModalProps {
    open: boolean
    onClose: () => void
    document: React.ReactElement
    fileName?: string
}

export function PDFPreviewModal({ open, onClose, document: pdfDocument, fileName = "estimate.pdf" }: PDFPreviewModalProps) {
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let currentUrl: string | null = null

        if (open) {
            setLoading(true)
            setPdfUrl(null)
            setError(null)

            // Dynamically import pdf function
            import("@react-pdf/renderer").then(({ pdf }) => {
                pdf(pdfDocument).toBlob().then((blob) => {
                    currentUrl = URL.createObjectURL(blob)
                    setPdfUrl(currentUrl)
                    setLoading(false)
                }).catch((err) => {
                    console.error("PDF blob error:", err)
                    setError(err.message || "PDF 생성 실패")
                    setLoading(false)
                })
            }).catch((err) => {
                console.error("PDF import error:", err)
                setError("PDF 라이브러리 로드 실패")
                setLoading(false)
            })
        }

        return () => {
            if (currentUrl) {
                URL.revokeObjectURL(currentUrl)
            }
        }
    }, [open, pdfDocument])

    const handleDownload = () => {
        if (pdfUrl) {
            const a = document.createElement("a")
            a.href = pdfUrl
            a.download = fileName
            a.click()
        }
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl w-[95vw] h-[90vh] p-0 overflow-hidden flex flex-col">
                <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b shrink-0">
                    <div>
                        <DialogTitle>📄 견적서 미리보기</DialogTitle>
                        <DialogDescription className="sr-only">PDF 견적서를 미리 확인합니다</DialogDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!pdfUrl}>
                            <Download className="h-4 w-4 mr-1" />
                            다운로드
                        </Button>
                    </div>
                </DialogHeader>
                <div className="flex-1 bg-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            <span className="ml-2 text-muted-foreground">PDF 생성 중...</span>
                        </div>
                    ) : pdfUrl ? (
                        <iframe
                            src={pdfUrl}
                            className="w-full h-full border-0"
                            title="PDF Preview"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-destructive">
                            <p>PDF 생성에 실패했습니다.</p>
                            {error && <p className="text-sm text-muted-foreground mt-2">{error}</p>}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
