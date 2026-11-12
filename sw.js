// Service worker: tiene in cache i file dell'app per aprirla offline.
// mwdux5bi viene sostituita da build.mjs: a ogni build la cache si rinnova.
const CACHE = 'imc-__VERSIONE__';
const FILE = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icone/icona-180.png', 'icone/icona-192.png', 'icone/icona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(nomi => Promise.all(nomi.filter(n => n !== CACHE && n !== 'imc-pdf' && n !== 'imc-lib').map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Solo i file dell'app (stessa origine, GET). Le chiamate a Google non passano dalla cache.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Rete prima (così gli aggiornamenti arrivano subito), cache se offline.
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// pdf.js dal CDN: lo tengo in cache per aprire i PDF anche offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/')) return;
  e.respondWith(caches.open('imc-lib').then(c => c.match(e.request).then(r => r || fetch(e.request).then(n => { if (n.ok) c.put(e.request, n.clone()); return n; }))));
});
