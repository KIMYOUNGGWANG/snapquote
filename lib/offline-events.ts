const OFFLINE_QUEUE_CHANGED_EVENT = "snapquote:offline-queue-changed"

export function emitOfflineQueueChanged(): void {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_CHANGED_EVENT))
}

export function subscribeOfflineQueueChanged(listener: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {}
    }

    const handle = () => listener()
    window.addEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handle)

    return () => {
        window.removeEventListener(OFFLINE_QUEUE_CHANGED_EVENT, handle)
    }
}
