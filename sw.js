const CACHE_NAME = 'dougcast-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

const CDN_ASSETS = [
    'https://unpkg.com/react@18/umd/react.development.js',
    'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
    'https://unpkg.com/@babel/standalone/babel.min.js',
    'https://cdn.tailwindcss.com'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets');
                // Cache local assets
                cache.addAll(STATIC_ASSETS);
                // Try to cache CDN assets (may fail due to CORS)
                CDN_ASSETS.forEach(url => {
                    fetch(url, { mode: 'cors' })
                        .then(response => {
                            if (response.ok) {
                                cache.put(url, response);
                            }
                        })
                        .catch(() => console.log('Could not cache:', url));
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip API calls and proxy requests (we want these fresh)
    if (url.href.includes('api.allorigins.win') ||
        url.href.includes('itunes.apple.com')) {
        event.respondWith(
            fetch(request)
                .catch(() => {
                    return new Response(
                        JSON.stringify({ error: 'Offline' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // For audio files, try network first then cache
    if (request.url.includes('.mp3') || request.url.includes('.m4a') ||
        request.headers.get('Accept')?.includes('audio')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone and cache successful audio fetches
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => cache.put(request, responseClone));
                    }
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // For podcast artwork, use cache-first with network fallback
    if (request.url.includes('is1-ssl.mzstatic.com') ||
        request.url.includes('artwork') ||
        request.destination === 'image') {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        // Return cached but also update in background
                        fetch(request)
                            .then((response) => {
                                if (response.ok) {
                                    caches.open(CACHE_NAME)
                                        .then((cache) => cache.put(request, response));
                                }
                            })
                            .catch(() => {});
                        return cachedResponse;
                    }
                    return fetch(request)
                        .then((response) => {
                            if (response.ok) {
                                const responseClone = response.clone();
                                caches.open(CACHE_NAME)
                                    .then((cache) => cache.put(request, responseClone));
                            }
                            return response;
                        });
                })
        );
        return;
    }

    // For static assets and CDN resources - cache first, network fallback
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then((response) => {
                        // Don't cache bad responses
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Cache successful responses for static assets
                        if (url.origin === location.origin ||
                            url.href.includes('unpkg.com') ||
                            url.href.includes('cdn.tailwindcss.com')) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(request, responseClone));
                        }

                        return response;
                    })
                    .catch(() => {
                        // Return offline page for navigation requests
                        if (request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return new Response('Offline', { status: 503 });
                    });
            })
    );
});

// Handle background sync for downloads
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-downloads') {
        event.waitUntil(syncDownloads());
    }
});

async function syncDownloads() {
    // This would sync any pending downloads when back online
    console.log('Syncing downloads...');
}

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || './'
            }
        };
        event.waitUntil(
            self.registration.showNotification(data.title || 'DougCast', options)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then((clientList) => {
                // Focus existing window if available
                for (const client of clientList) {
                    if (client.url.includes('index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if no existing window
                if (clients.openWindow) {
                    return clients.openWindow(event.notification.data.url || './');
                }
            })
    );
});

// Message handler for skip waiting
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
