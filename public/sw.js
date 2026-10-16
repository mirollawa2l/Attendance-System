// Network-first shell cache (kept from the original project). API calls are never cached: data lives on the server.
const CACHE='scouts-qr-v1',FILES=['./','./index.html','./app.js','./style.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./vendor/jsqr.js','./vendor/qrcode.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));}return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));});
