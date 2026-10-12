// Shows a friendly offline page instead of the browser's error when the app can't reach the internet.
// Network first for everything, so staff always get the latest version of the app when online.
const CACHE = 'wfg-offline-v1'
const OFFLINE = '/offline.html'
const KEEP = [OFFLINE, '/logo.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(KEEP)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)))
    return
  }

  // The offline page shows the logo, so keep a copy of it
  if (new URL(request.url).pathname === '/logo.png') {
    event.respondWith(fetch(request).catch(() => caches.match('/logo.png')))
  }
})
