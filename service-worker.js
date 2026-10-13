/* Retiro del portal anterior. No borra evidencias ni caches de otros proyectos. */
'use strict';
const DESTINATION='https://sistema-evidencias-d5c6h0eqcpgefbex.mexicocentral-01.azurewebsites.net/';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('sistema-evidencias-ops-'))await caches.delete(name);
  await self.clients.claim();
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of clients)if(client.url.startsWith(self.registration.scope))await client.navigate(self.registration.scope+'?azure=1').catch(()=>{});
})()));
self.addEventListener('fetch',event=>{
 if(event.request.method==='GET'&&event.request.mode==='navigate'&&event.request.url.startsWith(self.registration.scope))event.respondWith(Response.redirect(DESTINATION,302));
});
