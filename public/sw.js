const CACHE_NAME = "snapquote-cache-v1"
const OFFLINE_URL = "/offline.html"
const CORE_ASSETS = [
    "/",
    "/manifest.json",
    "/icon-192x192.png",
    "/icon-512x512.png",
    OFFLINE_URL,
]

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
    )
    self.skipWaiting()
})

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key)
                    }
                    return Promise.resolve(false)
                })
            )
        )
    )
    self.clients.claim()
})

self.addEventListener("fetch", (event) => {
    const request = event.request
    if (request.method !== "GET") return

    const url = new URL(request.url)
    const isSameOrigin = url.origin === self.location.origin

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone()
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
                    return response
                })
                .catch(async () => {
                    const cachedPage = await caches.match(request)
                    if (cachedPage) return cachedPage
                    return caches.match(OFFLINE_URL)
                })
        )
        return
    }

    if (!isSameOrigin) return

    const isStaticAsset = /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)
    if (!isStaticAsset) return

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached

            return fetch(request).then((response) => {
                const copy = response.clone()
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined)
                return response
            })
        })
    )
})
