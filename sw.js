const CACHE_NAME = 'edusearch-v2';
const urlsToCache =[ 
    '/', 
    '/index.html', 
    '/style.css', 
    '/app.js', 
    '/manifest.json', 
    '/favicon.svg',
    '/icons/favicon.png',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap ' 
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => Promise.all(
            cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        ))
    );
});