// Network only: never persist authenticated pages, API data or credentials.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{if(event.request.mode==="navigate")event.respondWith(fetch(event.request).catch(()=>new Response("ZYNOX: conexão indisponível. Reconecte-se para continuar.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}})));});
