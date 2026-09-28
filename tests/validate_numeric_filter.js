#!/usr/bin/env node
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const data = JSON.parse(fs.readFileSync('data/dashboard.json', 'utf8'));
const source = fs.readFileSync('app.js', 'utf8').replace(/bindEvents\(\); updateConnection\(\); loadData\(\);[\s\S]*$/, '');
const checks = `
state.data = data;
state.filters.activity = 'Jarras Blender | Cold Foam';
const module = state.data.quantityModules.find(item => item.activity === state.filters.activity);
assert(quantityChoices(module).some(item => item.value === 'blender|zero'));
const zero = new Set(state.data.submissions.filter(item => item.valid && item.activity === module.activity && item.quantities?.blender === 0).map(item => item.ceco));
state.filters.quantity = 'blender|zero';
assert.deepEqual(new Set(filteredStores().map(item => item.ceco)), zero);
assert(filteredQuantityResponses(module).every(item => item.quantities.blender === 0));
state.filters.quantity = 'blender|1-5';
assert(filteredQuantityResponses(module).every(item => item.quantities.blender >= 1 && item.quantities.blender <= 5));
state.filters.activity = 'FHW';
state.filters.quantity = 'pending';
const fhwAnswered = new Set(state.data.submissions.filter(item => item.valid && item.activity === 'FHW' && item.quantities).map(item => item.ceco));
assert.equal(filteredStores().length, state.data.stores.length - fhwAnswered.size);
const missingFhw = state.data.stores.find(item => !fhwAnswered.has(item.ceco));
const originalApplicability = missingFhw.applicableActivities?.FHW;
missingFhw.applicableActivities.FHW = false;
assert.equal(filteredStores().length, state.data.stores.length - fhwAnswered.size - 1);
if (originalApplicability === undefined) delete missingFhw.applicableActivities.FHW;
else missingFhw.applicableActivities.FHW = originalApplicability;
state.filters.quantity = 'cutlery|zero';
const fhwZero = state.data.submissions.filter(item => item.valid && item.activity === 'FHW' && item.quantities?.cutlery === 0).length;
assert.equal(filteredStores().length, fhwZero);
state.filters.activity = 'Organización Refrigeradores Back';
state.filters.quantity = '';
assert.equal(filteredStores().length, state.data.stores.length);
assert.equal(state.data.submissions.filter(item => item.activity === state.filters.activity && item.evidenceFiles?.length === 2).length >= 5, true);
state.filters.activity = 'Va X Cuenta';
const donation = activeQuantityModule();
assert.equal(donation.totalLabel, 'Plantilla reportada');
const records = state.data.submissions.filter(item => item.valid && item.activity === donation.activity && item.quantities);
const yes = records.reduce((sum,item) => sum + item.quantities.yesDonate, 0);
const no = records.reduce((sum,item) => sum + item.quantities.noDonate, 0);
assert.deepEqual([donation.answeredStores, donation.totals.yesDonate, donation.totals.noDonate, donation.totals.total, donation.totals.percentage],
  [records.length, yes, no, yes + no, yes + no ? Math.round(yes / (yes + no) * 1000) / 10 : null]);
assert.equal(quantityChoices(donation).filter(item => item.value === 'pending').length, 1);
assert(quantityChoices(donation).some(item => item.label === 'Sí · 21+'));
const regional = quantityRollup(filteredQuantityResponses(donation), donation.metrics, ['region'], donation.percentageMetric);
assert.equal(regional.reduce((sum,item) => sum + item.totals.total, 0), yes + no);
assert.equal(regional.reduce((sum,item) => sum + item.stores, 0), records.length);
state.filters.region = records[0].region;
const portfolio = quantityRollup(filteredQuantityResponses(donation), donation.metrics, ['region','dm'], donation.percentageMetric);
assert.equal(portfolio.reduce((sum,item) => sum + item.totals.total, 0),
  records.filter(item => item.region === state.filters.region).reduce((sum,item) => sum + item.quantities.total, 0));
state.filters.region = '';
state.filters.quantity = 'noDonate|zero';
assert.deepEqual(new Set(filteredStores().map(item => item.ceco)),
  new Set(records.filter(item => item.quantities.noDonate === 0).map(item => item.ceco)));
state.filters.quantity = '';
const spec = buildExcelSpec();
const donationSheet = spec.sheets.find(item => item.name === 'Va X Cuenta');
const summarySheet = spec.sheets.find(item => item.name === 'Participación');
assert.equal(donationSheet.rows[3].join(','), 'CeCo,Tienda,Región,DM,Sí dona,No dona,Plantilla reportada,% Sí dona,Evidencia');
assert.equal(donationSheet.rows.length, 4 + records.length);
assert.equal(summarySheet.rows[3].join(','), 'Región / DM,Tiendas,Sí,No,Plantilla,% Sí');
assert.equal(summarySheet.rows.length, 4 + regional.length + quantityRollup(records, donation.metrics, ['region','dm'], donation.percentageMetric).length);
assert.equal(summarySheet.rows.slice(4).reduce((sum,row) => sum + row[4], 0), 2 * (yes + no));
const elements = new Map();
const getElement = selector => {
  if (!elements.has(selector)) elements.set(selector, {
    hidden:false, textContent:'', innerHTML:'', classList:{toggle(){}}, style:{setProperty(){}},
    closest(){return {querySelector:()=>getElement('table-head')}}
  });
  return elements.get(selector);
};
const document = {querySelector:getElement};
renderQuantityModule();
assert.deepEqual(getElement('#quantity-breakdowns').innerHTML.split('<th scope="col">').slice(1,6).map(piece => piece.split('</th>')[0]),
  ['Región','Tiendas','Sí','No','Plantilla']);
assert(!getElement('#quantity-breakdowns').innerHTML.includes('<th>Ámbito</th>'));
assert.equal(getElement('#quantity-bars').hidden,true);
assert.equal(getElement('#quantity-totals').innerHTML.match(/class="quantity-total/g).length,4);
`;
vm.runInNewContext(source + checks, {data, assert, console}, {filename:'app.js'});
console.log('Filtro numérico validado · cero · rangos · pendiente · cambio de actividad');
