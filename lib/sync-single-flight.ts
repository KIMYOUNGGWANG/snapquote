const ignore = () => undefined

/**
 * Wraps an async task so overlapping calls never run it concurrently.
 * A call made while a run is in flight waits for one follow-up run that starts after the
 * current one settles, so it always observes writes made before the call. Every call made
 * during the same in-flight run shares that single follow-up.
 */
export function createCoalescedRunner<T>(task: () => Promise<T>): () => Promise<T> {
    let running: Promise<T> | null = null
    let queued: Promise<T> | null = null

    const start = () => {
        const run = task()
        running = run
        const clear = () => {
            if (running === run) running = null
        }
        run.then(clear, clear)
        return run
    }

    return () => {
        if (queued) return queued
        if (!running) return start()

        queued = running.then(ignore, ignore).then(() => {
            queued = null
            return start()
        })
        return queued
    }
}
