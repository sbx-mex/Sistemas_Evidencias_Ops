#!/usr/bin/env node
// Ejecuta el mismo motor del navegador con el JSON real, sin tocar los datos.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const data = JSON.parse(fs.readFileSync('data/dashboard.json', 'utf8'));
if (!data.quantityModules.some(module => module.activity === 'FHW')) {
  console.log('FHW no está activo en el CMS; el selector permanece oculto.');
  process.exit(0);
}
const before = JSON.stringify(data);
const source = fs.readFileSync('app.js', 'utf8').replace(/bindEvents\(\); updateConnection\(\); loadData\(\);[\s\S]*$/, '');
let workbook;
const checks = `
state.data = data;
const module = data.quantityModules.find(item => item.activity === 'FHW');
assert(module, 'FHW debe estar publicado en el CMS');
const elements = new Map();
const getElement = selector => {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, textContent: '', innerHTML: '', classList: {toggle(){}}, style: {setProperty(){}},
    querySelectorAll(){return []}, closest(){return {querySelector:()=>getElement('table-head')}}
  });
  return elements.get(selector);
};
const document = {querySelector:getElement};
let scenarios = 0;
function review(filters, expected) {
  state.filters = {region:'', dm:'', store:'', activity:'FHW', quantity:'', ...filters};
  for (const mode of ['total', 'average']) {
    state.fhwMode = mode;
    const summary = fhwSummary();
    assert.equal(summary.answered, expected.length);
    assert.equal(summary.pending, Math.max(0, summary.eligible - expected.length));
    const totals = Object.fromEntries(module.metrics.map(metric => [metric.key,
      expected.reduce((sum, row) => sum + row.quantities[metric.key], 0)]));
    totals.total = Object.values(totals).reduce((sum, value) => sum + value, 0);
    for (const [key, total] of Object.entries(totals)) {
      assert.equal(summary.totals[key], total);
      assert.equal(summary.values[key], !expected.length ? null : mode === 'average' ? total / expected.length : total);
    }
    renderQuantityModule();
    const header = getElement('table-head').innerHTML;
    assert(!header.includes('Piezas totales'));
    const columnCount = module.metrics.length + 2 + Number(!state.filters.dm && !state.filters.store);
    if (expected.length) assert.equal(getElement('#quantity-response-table').innerHTML.split('</tr>')[0].match(/<td>/g).length, columnCount);
    else assert(getElement('#quantity-response-table').innerHTML.includes('colspan="' + columnCount + '"'));
    assert.equal(getElement('#quantity-mode').hidden, false);
    assert.equal(getElement('#quantity-reading').textContent, summary.label);
    assert.equal(getElement('#quantity-basis').textContent, summary.basis);
    assert(getElement('#quantity-totals').innerHTML.includes(fhwNumber(summary.values.total)));
    assert.equal(getElement('.quantity-consolidation').hidden, false);
    assert(exportActivityLabel().endsWith(mode === 'average' ? 'Promedio' : 'Total'));
    const context = exportContext('xlsx');
    assert(context.filename.includes(mode === 'average' ? 'Promedio' : 'Total'));
    assert(context.summary.some(row => row[0] === 'Base' && row[1] === summary.basis));
    const spec = buildExcelSpec();
    assert.deepEqual(spec.sheets.map(sheet => sheet.name), ['Resumen FHW', 'FHW tiendas']);
    const summarySheet = spec.sheets[0];
    const detail = spec.sheets[1];
    assert(!detail.rows[3].includes('Piezas totales'));
    assert.equal(detail.rows.length, 4 + expected.length);
    assert.equal(detail.widths.length, detail.rows[3].length);
    assert(detail.rows.slice(4).every(row => row.length === detail.rows[3].length));
    module.metrics.forEach((metric, index) => {
      const value = summarySheet.rows[4 + index][1];
      const wanted = summary.values[metric.key];
      assert.equal(value === '' ? null : value.value, wanted == null ? null : mode === 'average' ? Math.round(wanted * 10) / 10 : wanted);
      assert.equal(detail.rows.slice(4).reduce((sum, row) => sum + row[3 + index], 0), totals[metric.key]);
    });
    assert.equal(summarySheet.rows[4 + module.metrics.length + 1][1], expected.length);
    const htmlBefore = getElement('#quantity-totals').innerHTML;
    buildExcelSpec();
    assert.equal(getElement('#quantity-totals').innerHTML, htmlBefore);
    scenarios += 1;
  }
}
const valid = data.submissions.filter(row => row.valid && row.activity === 'FHW' && row.quantities);
review({}, valid);
for (const region of data.regions) {
  const label = typeof region === 'string' ? region : region.region || region.name;
  review({region: label}, valid.filter(row => row.region === label));
}
for (const dm of [...new Set(valid.map(row => row.dm))]) review({dm}, valid.filter(row => row.dm === dm));
for (const entry of valid) review({store: entry.ceco}, [entry]);
review({quantity:'cutlery|zero'}, valid.filter(row => row.quantities.cutlery === 0));
review({quantity:'cups3Oz|1-5'}, valid.filter(row => row.quantities.cups3Oz >= 1 && row.quantities.cups3Oz <= 5));
review({quantity:'pending'}, []);
review({region:'Región inexistente'}, []);
const northern = valid.filter(row => row.region === 'Centro Norte');
state.filters = {region:'Centro Norte', dm:'', store:'', activity:'FHW', quantity:''};
state.fhwMode = 'average';
workbook = buildExcelSpec();
assert.equal(fhwSummary().values.cutlery, northern.reduce((sum,row)=>sum+row.quantities.cutlery,0)/northern.length);
const exportTexts=[];
const canvasContext={fillRect(){}, measureText(text){return {width:text.length*10}}, fillText(text){exportTexts.push(text)}};
document.createElement=()=>({width:0,height:0,getContext:()=>canvasContext});
assert.equal(renderFhwReportPages().length, 1);
assert(exportTexts.includes('Promedio por tienda'));
assert(exportTexts.includes(fhwSummary().basis));
assert(!exportTexts.includes('Piezas totales'));
assert.equal(JSON.stringify(data), before, 'Los filtros y modos nunca deben alterar las fuentes');
state.filters.activity = 'Jarras Blender | Cold Foam';
renderQuantityModule();
assert.equal(getElement('#quantity-mode').hidden,true);
assert(getElement('table-head').innerHTML.includes('Piezas totales'));
state.filters.activity = 'Va X Cuenta';
renderQuantityModule();
assert.equal(getElement('#quantity-consolidation-title').textContent,'Participación');
assert.equal(getElement('#quantity-mode').hidden,true);
console.log('FHW ejecutivo aprobado · ' + scenarios + ' escenarios · filtros · ceros · pendientes · promedio · Excel · canvas · otros módulos');
`;
const sandbox = {data, before, assert, console};
vm.runInNewContext(source + checks, sandbox, {filename:'app.js'});
workbook = sandbox.workbook;
if (process.argv[2]) {
  require('../xlsx-export.js');
  fs.writeFileSync(process.argv[2], Buffer.from(global.OPSXlsx.buildWorkbook(workbook)));
}
