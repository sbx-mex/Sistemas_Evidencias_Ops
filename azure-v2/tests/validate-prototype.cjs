const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../prototipo/index.html'), 'utf8');
const code = html.match(/<script id="evidence-model">([\s\S]*?)<\/script>/)[1];
const M = new vm.Script(code + '\nEvidenceModel;').runInNewContext({ structuredClone });
const p = M.profiles;
let tests = 0;
function test(name, run) { run(); tests++; console.log('OK · ' + name); }
const input = (override = {}) => ({ title: 'Actividad de prueba', description: 'Instrucciones.', kind: 'Actividad', due: '2026-10-16', allowNA: false, scope: 'district', dm: 'dm-a', regions: [], questions: [{ id: 'q1', label: 'Confirma el compromiso', type: 'text' }], ...override });

test('Una tienda tiene Nacional, Regional y dos Distritales sin duplicarse', () => {
  const s = M.createState(), rows = M.assignments(s, p['store-a']);
  assert.equal(rows.length, 4);
  assert.deepEqual(Array.from(rows.map(x => x.activity.scope)).sort(), ['district', 'district', 'national', 'regional']);
  assert.equal(new Set(rows.map(x => M.key(x.activity.id, x.store.ceco))).size, 4);
});
test('Cada DM ve únicamente las tiendas de su portafolio', () => {
  const s = M.createState();
  assert.deepEqual(Array.from(M.visibleStores(s, p['dm-a']).map(x => x.ceco)), ['39001', '39002']);
  assert.deepEqual(Array.from(M.visibleStores(s, p['dm-b']).map(x => x.ceco)), ['39003']);
  assert.equal(M.assignments(s, p['dm-b']).some(x => x.store.ceco === '39001' || x.activity.scope === 'district'), false);
});
test('Un DM no puede crear alcance Nacional, Regional u otro distrito', () => {
  const s = M.createState();
  for (const fields of [{ scope: 'national' }, { scope: 'regional', regions: ['Centro Norte'] }, { dm: 'dm-b' }]) assert.throws(() => M.createActivity(s, p['dm-a'], input(fields)), /portafolio/);
  assert.equal(s.activities.length, 4);
});
test('Una tienda no puede crear actividades', () => {
  assert.throws(() => M.createActivity(M.createState(), p['store-a'], input()), /tienda/);
});
test('Admin publica en varias regiones con una asignación por CeCo', () => {
  const s = M.createState(), a = M.createActivity(s, p.admin, input({ scope: 'regional', dm: null, regions: ['Centro Norte', 'Centro Sur', 'Centro Norte'] }));
  assert.deepEqual(Array.from(a.assigned), ['39001', '39002', '39003', '39004']);
  assert.equal(Object.keys(s.records).filter(k => k.startsWith(a.id + '|')).length, 4);
});
test('Alcances vacíos o manipulados no publican una actividad', () => {
  const s = M.createState();
  assert.throws(() => M.createActivity(s, p.admin, input({ scope: 'regional', regions: [] })), /región/);
  assert.throws(() => M.createActivity(s, p.admin, input({ scope: 'regional', regions: ['Desconocida'] })), /región/);
  assert.throws(() => M.createActivity(s, p.admin, input({ scope: 'district', dm: 'dm-inexistente' })), /DM/);
});
test('Un DM publica solo para su portafolio y crea pendientes', () => {
  const s = M.createState(), a = M.createActivity(s, p['dm-a'], input());
  assert.deepEqual(Array.from(a.assigned), ['39001', '39002']);
  assert.equal(s.records[M.key(a.id, '39001')].status, 'pending');
  assert.equal(M.visibleActivities(s, p['store-b']).some(x => x.id === a.id), false);
});
test('Enviar no aumenta el avance aprobado; aprobar sí lo aumenta', () => {
  const s = M.createState(), a = M.createActivity(s, p['dm-a'], input());
  const before = M.metrics(s, p['store-a']);
  const r = M.submit(s, p['store-a'], a.id, { answers: { q1: 'Listo.' } }, 0);
  assert.equal(r.status, 'review');
  assert.equal(M.metrics(s, p['store-a']).approved, before.approved);
  M.review(s, p['dm-a'], a.id, '39001', 'approve', '', r.version);
  assert.equal(M.metrics(s, p['store-a']).approved, before.approved + 1);
});
test('Un envío duplicado no crea respuesta ni cumplimiento adicionales', () => {
  const s = M.createState(), a = M.createActivity(s, p['dm-a'], input());
  M.submit(s, p['store-a'], a.id, { answers: { q1: 'Listo.' } }, 0);
  assert.throws(() => M.submit(s, p['store-a'], a.id, { answers: { q1: 'Repetido.' } }, 1), /ya fue enviada/);
  assert.equal(s.records[M.key(a.id, '39001')].version, 1);
  assert.equal(s.records[M.key(a.id, '39001')].history.length, 1);
});
test('Una tienda no puede responder una actividad ajena a su alcance', () => {
  assert.throws(() => M.submit(M.createState(), p['store-b'], 'district-1', { answers: {} }, 0), /no está asignada/);
});
test('DM de otro portafolio y tienda no pueden validar', () => {
  const s = M.createState();
  assert.throws(() => M.review(s, p['dm-b'], 'regional', '39001', 'approve', '', 1), /portafolio/);
  assert.throws(() => M.review(s, p['store-a'], 'regional', '39001', 'approve', '', 1), /no puede validar/);
  assert.equal(s.records[M.key('regional', '39001')].status, 'review');
});
test('Corrección exige comentario y conserva las versiones del reenvío', () => {
  const s = M.createState(), a = M.createActivity(s, p['dm-a'], input());
  M.submit(s, p['store-a'], a.id, { answers: { q1: 'Primera versión' } }, 0);
  assert.throws(() => M.review(s, p['dm-a'], a.id, '39001', 'correct', '', 1), /qué debe corregir/);
  M.review(s, p['dm-a'], a.id, '39001', 'correct', 'Agrega responsable.', 1);
  M.submit(s, p['store-a'], a.id, { answers: { q1: 'Versión con responsable' } }, 2);
  const r = s.records[M.key(a.id, '39001')];
  assert.equal(r.version, 3);
  assert.equal(r.status, 'review');
  assert.equal(r.history[0].answers.q1, 'Primera versión');
  assert.equal(r.history[1].comment, 'Agrega responsable.');
});
test('Dos validadores no pueden aprobar la misma versión dos veces', () => {
  const s = M.createState();
  M.review(s, p['dm-a'], 'regional', '39001', 'approve', '', 1);
  assert.throws(() => M.review(s, p.admin, 'regional', '39001', 'approve', '', 1), /cambió el registro/);
  assert.equal(s.records[M.key('regional', '39001')].version, 2);
});
test('No aplica solicitado sigue en el denominador hasta aprobarse', () => {
  const s = M.createState(), a = M.createActivity(s, p.admin, input({ allowNA: true }));
  const before = M.metrics(s, p['store-a']);
  M.submit(s, p['store-a'], a.id, { noApply: true, reason: 'No contamos con este equipo.' }, 0);
  assert.equal(M.metrics(s, p['store-a']).total, before.total);
  M.review(s, p['dm-a'], a.id, '39001', 'approve', '', 1);
  assert.equal(M.metrics(s, p['store-a']).total, before.total - 1);
  assert.equal(M.metrics(s, p['store-a']).approved, before.approved);
});
test('No aplica requiere permiso y justificación', () => {
  const s = M.createState(), a = M.createActivity(s, p.admin, input({ allowNA: true }));
  assert.throws(() => M.submit(s, p['store-a'], a.id, { noApply: true, reason: '' }, 0), /justificación/);
  assert.throws(() => M.submit(s, p['store-a'], 'district-1', { noApply: true, reason: 'No aplica.' }, 0), /justificación/);
});
test('Las preguntas obligatorias, números y archivos se validan', () => {
  const s = M.createState(), a = M.createActivity(s, p.admin, input({ questions: [{ id: 'q1', type: 'number', label: 'Cantidad' }, { id: 'q2', type: 'file', label: 'Foto' }] }));
  assert.throws(() => M.submit(s, p['store-a'], a.id, { answers: { q1: '-1' }, files: [{ question: 'q2', name: 'foto.jpg' }] }, 0), /número/);
  assert.throws(() => M.submit(s, p['store-a'], a.id, { answers: { q1: '3' }, files: [] }, 0), /archivo/);
  assert.equal(s.records[M.key(a.id, '39001')].status, 'pending');
});
test('Sin asignaciones aplicables no se muestra 0% o 100%', () => {
  const s = M.createState();
  for (const a of M.visibleActivities(s, p['store-a'])) s.records[M.key(a.id, '39001')].status = 'na_approved';
  assert.equal(M.metrics(s, p['store-a']).percentage, null);
});
test('El piloto no incorpora claves ni dependencias externas', () => {
  assert.equal(/type\s*=\s*["']password/i.test(html), false);
  assert.equal(/<script[^>]+src\s*=/.test(html), false);
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(html), false);
  assert.equal(/https?:\/\//.test(html), false);
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, source] of scripts) new vm.Script(source);
});
console.log('\n' + tests + ' pruebas correctas.');
