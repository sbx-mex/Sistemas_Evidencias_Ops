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
  d => { d.dms = []; },
  d => { d.dms[0].completed += 1; },
  d => { d.dms[0].rank = 2; },
  d => { d.dms[0].regions = []; },
  d => { d.summary.compliance = 99.9; },
  d => { d.summary.validResponses += 1; },
  d => { d.summary.storesComplete += 1; },
  d => { d.summary.regions += 1; },
  d => { d.regions = []; },
  d => { d.stores[0].compliance = 99.9; },
  d => { d.activities[0].completedStores += 1; },
  d => { d.activities[0].compliance = 99.9; },
  d => { const r = d.submissions.find(item => item.quantities); const m = d.quantityModules.find(item => item.activity === r.activity); r.quantities[m.metrics[0].key] = -1; },
  d => { d.submissions.find(item => item.quantities).quantities.total += 1; },
  d => { d.quantityModules[0].totals.total += 1; },
  d => { d.quantityModules[0].byRegion = []; },
  d => { d.quantityModules[0].byPortfolio[0].totals.total += 1; },
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
      delete: async key => cache.delete(key.url),
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
  cache.set(request.url, new Response(JSON.stringify(broken)));
  network = new Error('Sin red'); await assert.rejects(load);
  assert.equal(cache.size, 0, 'Una copia corrupta debe descartarse');
  cache.set(request.url, new Response(JSON.stringify(data)));
  for (const status of [401, 403]) {
    network = new Response('Acceso denegado', {status});
    assert.equal((await load()).status, status, 'Un acceso denegado no debe sustituirse por caché');
  }
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
  // El diagnóstico de Acerca de usa las mismas incidencias de Python y
  // distingue filas de motivos; nunca duplica una fila con varias razones.
  const reviewData = copy();
  reviewData.quality.unknownCeCos = ['38104', '38104', '38489'];
  reviewData.quality.quarantinedResponses = [
    {source:'Forms nuevo',row:2,reasons:['ceco','finished']},
    {source:'Forms nuevo',row:2,reasons:['ceco','finished']},
    {source:'corte histórico',row:2,reasons:['unsafe-evidence-link','incomplete-multi-evidence']},
  ];
  reviewData.quality.quantityResponseIssues = [{row:3},{row:3},{row:4}];
  context.reviewData = reviewData;
  const review = vm.runInContext('aboutLoadReview(reviewData)', context);
  assert.equal(review.unknown.length, 2);
  assert.equal(review.isolated, 2);
  assert.equal(review.quantity, 2);
  assert.equal(review.findings.find(item => item.title.startsWith('Evidencia')).count, 1);
  vm.runInContext('state.data = reviewData; state.cachedData = false; state.loadStatus = "ready"; updateConnection()', context);
  assert(element('#about-load-summary').textContent.includes('2 CeCo fuera del catálogo'));
  assert.equal(element('#about-load-details').hidden, false);
  assert(element('#about-load-findings').innerHTML.includes('38104, 38489'));
  const clean = copy();
  clean.quality.unknownCeCos = []; clean.quality.quarantinedResponses = []; clean.quality.quantityResponseIssues = [];
  context.clean = clean;
  vm.runInContext('state.data = clean; updateConnection()', context);
  assert.equal(element('#connection-status').dataset.state, 'ready');
  assert.equal(element('#about-load-details').hidden, true);
  assert.equal(element('#about-refresh-button').disabled, false);
  vm.runInContext('state.loadStatus = "loading"; updateConnection()', context);
  assert.equal(element('#about-refresh-button').disabled, true);
  assert.equal(element('#about-refresh-label').textContent, 'Consultando…');
  context.fetch = async () => { throw Object.assign(new Error('Timeout'), {name:'AbortError'}); };
  assert.equal(await vm.runInContext('loadData()', context), false);
  assert(element('#about-load-summary').textContent.includes('tardó demasiado'));
  assert(element('#about-load-summary').textContent.includes('última carga válida'));
  assert.equal(element('#about-refresh-button').disabled, false);
  assert.equal(element('#about-load-date').textContent, data.lastUpdatedDisplay);
  console.log('Acerca de aprobado: diagnóstico sin duplicados, motivos y correcciones, cantidades, corte, carga verde/ámbar/error, bloqueo de doble actualización y recuperación');
  console.log('Carga segura aprobada: cruces/totales/controles, JSON parcial, HTTP 503, sin red, cuota de caché, copia local ámbar y recuperación sin perder la última carga');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
