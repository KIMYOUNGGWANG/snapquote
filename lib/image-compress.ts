// Browser-only: shrinks a photo with canvas so it fits the completion report photo limit.
const MAX_DATA_URL_LENGTH = 400_000
const MIN_QUALITY = 0.4

/**
 * Long edge <= maxEdge, JPEG. Steps quality down if the data URL is still over 400,000 chars.
 * Throws when the browser cannot decode the file (e.g. HEIC outside Safari); callers list the file name.
 */
export async function compressImageToDataUrl(file: File, maxEdge = 1280, quality = 0.7): Promise<string> {
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file)
    } catch {
        throw new Error(`Could not read ${file.name}`)
    }

    try {
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement("canvas")
        canvas.width = Math.max(1, Math.round(bitmap.width * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * scale))
        const context = canvas.getContext("2d")
        if (!context) throw new Error(`Could not read ${file.name}`)
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

        for (let q = quality; q >= MIN_QUALITY; q -= 0.15) {
            const dataUrl = canvas.toDataURL("image/jpeg", q)
            if (dataUrl.length <= MAX_DATA_URL_LENGTH) return dataUrl
        }
        throw new Error(`${file.name} is too large`)
    } finally {
        bitmap.close()
    }
}
