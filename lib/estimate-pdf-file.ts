export function toSafeEstimateFilePart(value: string | undefined, fallback: string) {
    const safeValue = value
        ?.normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

    return safeValue || fallback
}

export function buildEstimatePdfFileName({
    estimateNumber,
    clientName,
}: {
    estimateNumber?: string
    clientName?: string
}) {
    const estimatePart = toSafeEstimateFilePart(estimateNumber, "estimate")
    const clientPart = toSafeEstimateFilePart(clientName, "customer")
        .toLowerCase()
        .slice(0, 48)
        .replace(/-+$/g, "")
    const baseName = `${estimatePart}-${clientPart || "customer"}-estimate`

    return `${baseName.slice(0, 96).replace(/-+$/g, "")}.pdf`
}

export function downloadBlobAsFile(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
