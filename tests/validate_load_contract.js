#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
require('../data-contract.js');
const data = JSON.parse(fs.readFileSync('data/dashboard.json', 'utf8'));
const copy = () => structuredClone(data);
assert.equal(OPSDashboard.validate(data), data);
for (const change of [
  d => { d.summary.completedCompletions += 1; },
  d => { d.stores.push(d.stores[0]); },
  d => { d.submissions.push(d.submissions[0]); },
  d => { d.submissions[0].ceco = '99999'; },
  d => { d.submissions[0].dm = 'Cruce equivocado'; },
  d => { d.quality.stabilityControls.sourceIntegrity = false; },
  d => { delete d.quality.stabilityControls.rowQuarantine; },
  d => { d.stores[0].expected += 1; },
  d => { d.submissions.splice(0, 1); },
]) {
  const broken = copy(); change(broken); assert.throws(() => OPSDashboard.validate(broken));
}

async function main() {
  const cache = new Map();
  let network = new Response(JSON.stringify(data));
  let quotaError = false;
  const swContext = {
    self: { addEventListener() {}, location: { href: 'https://example.test/ops/service-worker.js' }, OPSDashboard },
    importScripts() {}, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
    caches: { open: async () => ({
      put: async (key, response) => { if (quotaError) throw new Error('Quota'); cache.set(key.url, response.clone()); },
      match: async key => cache.get(key.url)?.clone(),
    }) },
    fetch: async () => { if (network instanceof Error) throw network; return network.clone(); },
  };
  vm.createContext(swContext);
  vm.runInContext(fs.readFileSync('service-worker.js', 'utf8'), swContext);
  const request = new Request('https://example.test/ops/data/dashboard.json');
  swContext.request = request;
  const load = () => vm.runInContext('networkFirst(request, request, true)', swContext);
  assert.equal((await load()).headers.get('X-OPS-Data-Source'), null);
  const broken = copy(); broken.summary.completedCompletions += 1;
  for (const failure of [new Error('Sin red'), new Response('Error', {status: 503}), new Response(JSON.stringify(broken)), new Response('{parcial')]) {
    network = failure;
    const response = await load();
    assert.equal(response.headers.get('X-OPS-Data-Source'), 'cache');
    assert.deepEqual(await response.json(), data);
  }
  cache.clear(); network = new Response('{parcial'); await assert.rejects(load);
  quotaError = true; network = new Response(JSON.stringify(data)); assert.deepEqual(await (await load()).json(), data);

  // La app conserva la carga válida y nunca marca verde un JSON roto.
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {disabled: false, hidden: true, dataset: {}, setAttribute() {}, textContent: '', innerHTML: ''});
    return elements.get(selector);
  };
  const context = {
    window: {OPSDashboard}, document: {querySelector: element, querySelectorAll: () => []},
    navigator: {onLine: true}, AbortController, setTimeout, clearTimeout, URLSearchParams,
    location: {search: ''}, localStorage: {setItem() {}},
    fetch: async () => network.clone(),
  };
  vm.createContext(context);
  const app = fs.readFileSync('app.js', 'utf8').replace(/bindEvents\(\); updateConnection\(\); loadData\(\);[\s\S]*$/, '');
  vm.runInContext(app + '\npopulateFilters = populateEvidenceFilters = renderAll = () => {};', context);
  network = new Response(JSON.stringify(data)); assert.equal(await vm.runInContext('loadData()', context), true);
  assert.equal(vm.runInContext('state.loadStatus', context), 'ready');
  const version = vm.runInContext('state.data.buildVersion', context);
  network = new Response(JSON.stringify(broken)); assert.equal(await vm.runInContext('loadData()', context), false);
  assert.equal(vm.runInContext('state.data.buildVersion', context), version);
  assert.equal(element('#connection-status').dataset.state, 'error');
  assert.equal(element('#refresh-button').disabled, false);
  network = new Response(JSON.stringify(data), {headers: {'X-OPS-Data-Source': 'cache'}});
  assert.equal(await vm.runInContext('loadData()', context), true);
  assert.equal(element('#connection-status').dataset.state, 'review');
  assert.equal(element('#offline-banner').hidden, false);
  console.log('Carga segura aprobada: cruces/totales/controles, JSON parcial, HTTP 503, sin red, cuota de caché, copia local ámbar y recuperación sin perder la última carga');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
