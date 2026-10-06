#!/usr/bin/env node
// Ejercita respuestas reales de Fetch y la vida del evento en un SW aislado.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const listeners = new Map(), cache = new Map();
let network = new Error('Sin red'), quota = false, fetches = 0;
const context = {
  self: {location: {href:'https://example.test/ops/service-worker.js', origin:'https://example.test'},
    addEventListener: (type, handler) => listeners.set(type, handler), OPSDashboard: {validate() {}}},
  importScripts() {}, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
  caches: {open:async()=>({match:async request=>cache.get(request.url)?.clone(),
    put:async(request, response)=>{if(quota) throw Error('Cuota');cache.set(request.url,response.clone());}})},
  fetch:async()=>{fetches++;if(network instanceof Error) throw network;return network.clone();},
};
vm.createContext(context); vm.runInContext(fs.readFileSync('service-worker.js','utf8'),context);
context.request = new Request('https://example.test/ops/assets/photo.webp');
const load = () => vm.runInContext('staleWhileRevalidate(request, event)',context);
async function main() {
  const pending = [];context.event={waitUntil:promise=>pending.push(promise)};
  assert.equal((await load()).type,'error','Sin red ni caché debe devolver una Response válida');
  quota=true;network=new Response('imagen nueva');
  assert.equal(await (await load()).text(),'imagen nueva','La cuota no debe impedir descargar la imagen');
  quota=false;cache.set(context.request.url,new Response('imagen previa'));
  network=new Response('imagen actualizada');
  assert.equal(await (await load()).text(),'imagen previa');
  await Promise.all(pending);assert.equal(await cache.get(context.request.url).text(),'imagen actualizada');
  let intercepted=false;
  listeners.get('fetch')({request:new Request('https://example.test/.auth/logout'),respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,'El SW debe dejar el cierre de sesión al servidor');
  listeners.get('fetch')({request:new Request('https://example.test/.auth/login/aad'),respondWith(){intercepted=true;}});
  assert.equal(intercepted,false,'El SW debe dejar el inicio de sesión al servidor');
  assert(fetches>0);
  console.log('PWA aprobada · sin red · cuota agotada · renovación de imagen con waitUntil · autenticación sin interceptar');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
