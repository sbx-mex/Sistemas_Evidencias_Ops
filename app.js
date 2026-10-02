const state = {
  data: null,
  filters: { region: "", dm: "", store: "", activity: "", quantity: "" },
  evidenceFilters: { region: "", dm: "", store: "", activity: "" },
  showAllEvidence: false,
  fhwMode: "total",
  exporting: false,
  exportDecision: null,
  exportUrl: "",
  installPrompt: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const number = (value) => Number(value || 0).toLocaleString("es-MX");
const percent = (value) => `${Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
const initials = (value) => String(value || "DM").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const engineLoads = new Map();

function loadScriptOnce(source, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!engineLoads.has(source)) {
    engineLoads.set(source, new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = true;
      script.onload = () => window[globalName] ? resolve(window[globalName]) : reject(new Error(`El motor ${globalName} no inició.`));
      script.onerror = () => reject(new Error(`No fue posible cargar ${source}.`));
      document.head.append(script);
    }).catch((error) => {
      engineLoads.delete(source);
      throw error;
    }));
  }
  return engineLoads.get(source);
}

function loadExportEngine(format) {
  return format === "pdf"
    ? loadScriptOnce("./pdf-export.js", "OPSPdf")
    : loadScriptOnce("./xlsx-export.js", "OPSXlsx");
}

function selectedActivities() {
  return state.filters.activity ? [state.filters.activity] : state.data.activities.map((item) => item.name);
}

function quantityChoices(module) {
  if (!module?.metrics?.length) return [];
  const choices = module.metrics.flatMap((metric) => {
    const upper = Number(metric.maximum ?? module.maximum);
    const lower = Number(metric.minimum ?? module.minimum);
    const ranges = lower <= 0 ? [{value: "zero", label: "0"}] : [];
    if (upper >= 1 && lower <= 5) ranges.push({value: "1-5", label: `${Math.max(1, lower)}–${Math.min(5, upper)}`});
    if (upper >= 6 && lower <= 20) ranges.push({value: "6-20", label: `${Math.max(6, lower)}–${Math.min(20, upper)}`});
    if (upper >= 21) ranges.push({value: "21+", label: `${Math.max(21, lower)}+`});
    const label = module.percentageMetric ? metric.label.replace(/\s+dona$/i, "") : metric.label;
    return ranges.map((range) => ({value: `${metric.key}|${range.value}`, label: `${label} · ${range.label}`}));
  });
  return [...choices, {value: "pending", label: "Sin respuesta"}];
}

function matchingQuantityStores() {
  const module = (state.data.quantityModules || []).find((item) => item.activity === state.filters.activity);
  const choice = quantityChoices(module).find((item) => item.value === state.filters.quantity);
  if (!choice) return null;
  if (choice.value === "pending") {
    const answered = new Set(state.data.submissions.filter((item) => item.valid && item.activity === module.activity && item.quantities).map((item) => item.ceco));
    return new Set(state.data.stores.filter((store) => store.applicableActivities?.[module.activity] !== false && !answered.has(store.ceco)).map((store) => store.ceco));
  }
  const [key, band] = choice.value.split("|");
  const answers = new Map(state.data.submissions.filter((item) => item.valid && item.activity === module.activity && item.quantities)
    .map((item) => [item.ceco, item.quantities[key]]));
  return new Set(state.data.stores.filter((store) => {
    if (!answers.has(store.ceco)) return false;
    const value = answers.get(store.ceco);
    return band === "zero" ? value === 0 : band === "1-5" ? value >= 1 && value <= 5
      : band === "6-20" ? value >= 6 && value <= 20 : band === "21+" ? value >= 21 : false;
  }).map((store) => store.ceco));
}

function filteredStores() {
  const quantityStores = matchingQuantityStores();
  return state.data.stores.filter((store) =>
    (!state.filters.region || store.region === state.filters.region) &&
    (!state.filters.dm || store.dm === state.filters.dm) &&
    (!state.filters.store || store.ceco === state.filters.store) &&
    (!quantityStores || quantityStores.has(store.ceco)));
}

function completionFor(store, activities = selectedActivities()) {
  const applicable = activities.filter((activity) => store.applicableActivities?.[activity] !== false);
  const completed = applicable.reduce((sum, activity) => sum + (store.activities[activity] ? 1 : 0), 0);
  const expected = applicable.length;
  const notApplicable = activities.length - expected;
  return { completed, expected, notApplicable, pending: expected - completed, compliance: expected ? completed / expected * 100 : 0 };
}

function metrics() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const storeProgress = stores.map((store) => completionFor(store, activities));
  const expected = storeProgress.reduce((sum, item) => sum + item.expected, 0);
  const completed = storeProgress.reduce((sum, item) => sum + item.completed, 0);
  const notApplicable = storeProgress.reduce((sum, item) => sum + item.notApplicable, 0);
  return {
    dms: new Set(stores.map((store) => store.dm)).size,
    regions: new Set(stores.map((store) => store.region)).size,
    stores: stores.length,
    activities: activities.length,
    completed,
    expected,
    pending: expected - completed,
    notApplicable,
    compliance: expected ? completed / expected * 100 : 0,
    completedStores: storeProgress.filter((item) => item.completed > 0).length,
    notStartedStores: storeProgress.filter((item) => item.completed === 0).length,
  };
}

function currentScope() {
  if (state.filters.store) return filteredStores()[0]?.store || "Tienda";
  return state.filters.dm || state.filters.region || state.data.region;
}

function semaphore(value) {
  if (value >= 80) return { label: "En meta", tone: "green" };
  if (value >= 40) return { label: "Seguimiento", tone: "amber" };
  return { label: "Atención", tone: "red" };
}

function cutDate() {
  const raw = state.data?.lastUpdatedDisplay || "Sin datos";
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[1]}/${match[2]}/${match[3].slice(-2)}` : raw;
}

function cutStamp() {
  if (state.data?.report?.cutOffDisplay) return state.data.report.cutOffDisplay;
  const raw = state.data?.lastUpdatedDisplay || "Sin datos";
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/);
  return match ? `${match[1]}/${match[2]}/${match[3].slice(-2)}${match[4] ? ` · ${match[4]} h` : ""}` : raw;
}

function reportMeta() {
  return state.data.report || {
    title: "Sistema de Evidencia OPS", subtitle: "Dashboard de Avance de Actividades",
    motto: "CADA DETALLE CUENTA", footerLabel: "Starbucks México · Operaciones",
  };
}

function exportProfile() {
  const organization = state.data.organization || {};
  const director = organization.nationalDirector || reportMeta().regionalDirector || {
    name: "Raúl Sinohe Sierra Santamaria", role: "Director Starbucks México", photo: "assets/director/raul-sierra.webp",
  };
  const dmName = state.filters.dm || (state.filters.store ? filteredStores()[0]?.dm : "");
  const dm = dmName ? state.data.dms.find((item) => item.dm === dmName) : null;
  if (dm) return { name: dm.shortName || dm.dm, role: "DM", photo: dm.photo || "assets/icons/icon-192.webp" };
  if (state.filters.region) {
    const regional = (organization.regionalDirectors || []).find((item) => item.region === state.filters.region);
    if (regional) return { ...regional, photo: regional.photo || "assets/icons/icon-192.webp" };
  }
  return director;
}

function renderOrganization() {
  const organization = state.data.organization || {};
  const regionals = organization.regionalDirectors || [];
  $("#organization-grid").innerHTML = regionals.length ? regionals.map((person) => {
    const compliance = Number(person.compliance || 0);
    const portrait = person.photo
      ? `<img src="./${esc(person.photo)}" alt="Fotografía de ${esc(person.name)}" width="72" height="88" loading="lazy">`
      : `<span class="organization-avatar" aria-label="Fotografía pendiente">${esc(initials(person.name))}</span>`;
    const filterValue = person.filterValue || person.region;
    const selected = state.filters.region === filterValue;
    return `<button class="organization-card${selected ? " selected" : ""}" type="button" data-region-focus="${esc(filterValue)}" aria-pressed="${selected}" aria-label="${selected ? "Quitar filtro" : "Filtrar"} de ${esc(person.region)}; ${number(person.stores)} tiendas">${portrait}<span class="organization-copy"><small>${esc(person.region)}</small><strong>${esc(person.name)}</strong><em>${number(person.stores)} tiendas</em></span><span class="director-progress"><strong>${percent(compliance)}</strong></span><span class="region-progress" aria-label="${esc(person.region)}: ${percent(compliance)}"><i style="--progress:${Math.min(compliance, 100)}%"></i></span></button>`;
  }).join("") : '<div class="empty-state">Sin responsables activos en el CMS.</div>';
}

function renderSummary() {
  const item = metrics();
  const signal = semaphore(item.compliance);
  $("#score-value").textContent = percent(item.compliance);
  $("#score-ring").dataset.tone = signal.tone;
  $("#score-ring").style.setProperty("--score", `${Math.min(item.compliance, 100) * 3.6}deg`);
  $("#score-title").textContent = currentScope();
  $("#score-message").textContent = !item.expected
    ? "Sin actividades disponibles para el alcance seleccionado."
    : item.pending
      ? `${number(item.completed)} de ${number(item.expected)} registros completos · ${number(item.pending)} pendientes.`
      : `${number(item.completed)} de ${number(item.expected)} registros completos.`;
  const cards = [
    [item.stores, item.stores === 1 ? "Tienda" : "Tiendas"],
    [item.activities, item.activities === 1 ? "Actividad" : "Actividades"],
  ];
  if (!state.filters.dm && !state.filters.store) cards.push([item.dms, "DM"]);
  if (!state.filters.region && !state.filters.dm && !state.filters.store) {
    cards.push([item.regions, item.regions === 1 ? "Región" : "Regiones"]);
  }
  $("#kpi-grid").innerHTML = cards.map(([value, label]) =>
    `<article class="kpi"><strong>${number(value)}</strong><span>${label}</span></article>`).join("");
}

function hasSelectedDetail() {
  const survey = activeSurveyModule();
  return Boolean(activeQuantityModule() || (survey && filteredSurveyResponses(survey).length));
}

function renderActivities() {
  // El detalle por tienda ya identifica la actividad seleccionada y su avance.
  const detailed = hasSelectedDetail();
  $("#actividades").hidden = detailed;
  $("#activities-nav").hidden = detailed;
  if (detailed) return;
  const stores = filteredStores();
  const activities = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  const rows = activities.map((item) => {
    const progress = stores.map((store) => completionFor(store, [item.name]));
    const completed = progress.reduce((sum, row) => sum + row.completed, 0);
    const expected = progress.reduce((sum, row) => sum + row.expected, 0);
    const value = expected ? completed / expected * 100 : 0;
    const complete = expected > 0 && completed === expected;
    return { item, completed, expected, value, complete };
  }).sort((a, b) => Number(a.complete) - Number(b.complete)
    || (a.item.endDate || "9999-12-31").localeCompare(b.item.endDate || "9999-12-31")
    || (a.item.focusRank || a.item.order) - (b.item.focusRank || b.item.order));
  $("#activity-progress").innerHTML = rows.length ? rows.map((row, index) => {
    const { item, completed, expected, value, complete } = row;
    const tone = complete ? "green" : (item.deadlineTone || "neutral");
    const label = complete ? "Completa" : (item.deadlineLabel || "Pendiente");
    return `<tr class="activity-focus-row ${tone}">
      <td><span class="focus-rank">${index + 1}</span></td>
      <td><span class="activity-name"><strong>${esc(item.name)}</strong><small>${esc(item.description || "Actividad vigente")}</small></span></td>
      <td><time>${esc(item.commitmentDateDisplay || "Sin fecha")}</time></td>
      <td><strong>${number(completed)} de ${number(expected)}</strong></td>
      <td><div class="table-progress ${semaphore(value).tone}"><span><i style="--progress:${Math.min(value, 100)}%"></i></span><b>${percent(value)}</b></div></td>
      <td><span class="status ${tone}">${esc(label)}</span></td>
    </tr>`;
  }).join("") : '<tr><td colspan="6"><div class="empty-state">No hay actividades para el filtro seleccionado.</div></td></tr>';
}

function activeQuantityModule() {
  return (state.data.quantityModules || []).find((item) => item.activity === state.filters.activity) || null;
}

function filteredQuantityResponses(module) {
  const included = new Set(filteredStores().map((store) => store.ceco));
  return state.data.submissions.filter((item) =>
    item.valid && item.activity === module.activity && item.quantities && included.has(item.ceco) &&
    (!state.filters.region || item.region === state.filters.region) &&
    (!state.filters.dm || item.dm === state.filters.dm) &&
    (!state.filters.store || item.ceco === state.filters.store));
}

function quantityRollup(responses, metrics, groupFields, percentageMetric) {
  const groups = new Map();
  for (const item of responses) {
    const labels = groupFields.map((field) => item[field]);
    const key = JSON.stringify(labels);
    if (!groups.has(key)) groups.set(key, { labels, stores: 0, totals: Object.fromEntries(metrics.map((metric) => [metric.key, 0])) });
    const group = groups.get(key);
    group.stores += 1;
    metrics.forEach((metric) => { group.totals[metric.key] += Number(item.quantities[metric.key] || 0); });
  }
  return [...groups.values()].sort((a, b) => a.labels.join(' ').localeCompare(b.labels.join(' '), 'es-MX')).map((group) => {
    group.totals.total = metrics.reduce((sum, metric) => sum + group.totals[metric.key], 0);
    if (percentageMetric) group.totals.percentage = group.totals.total
      ? Math.round(group.totals[percentageMetric] / group.totals.total * 1000) / 10 : null;
    return group;
  });
}

function isFhwModule(module = activeQuantityModule()) {
  return module?.activity === "FHW";
}

function fhwNumber(value, mode = state.fhwMode) {
  return value == null ? "—" : Number(value).toLocaleString("es-MX", {
    minimumFractionDigits: mode === "average" ? 1 : 0,
    maximumFractionDigits: mode === "average" ? 1 : 0,
  });
}

function fhwSummary(module = activeQuantityModule()) {
  const responses = filteredQuantityResponses(module);
  const eligible = filteredStores().filter((store) => store.applicableActivities?.[module.activity] !== false).length;
  const totals = Object.fromEntries(module.metrics.map((metric) => [metric.key,
    responses.reduce((sum, item) => sum + Number(item.quantities[metric.key] || 0), 0)]));
  totals.total = module.metrics.reduce((sum, metric) => sum + totals[metric.key], 0);
  const mode = state.fhwMode === "average" ? "average" : "total";
  const values = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key,
    !responses.length ? null : mode === "average" ? value / responses.length : value]));
  return { module, responses, totals, values, mode, eligible, answered: responses.length,
    pending: Math.max(0, eligible - responses.length),
    coverage: eligible ? responses.length / eligible * 100 : null,
    label: mode === "average" ? "Promedio por tienda" : "Total de piezas",
    basis: responses.length ? `Base: ${number(responses.length)} tiendas con respuesta · ${number(Math.max(0, eligible - responses.length))} sin respuesta`
      : "Sin respuestas válidas en este filtro",
    note: mode === "average" ? "Piezas ÷ tiendas con respuesta. Incluye las respuestas en cero."
      : "Suma de las respuestas del filtro actual.",
  };
}

function renderQuantityModule() {
  const section = $("#inventario-jarras");
  const nav = $("#quantity-nav");
  const module = activeQuantityModule();
  section.hidden = !module;
  nav.hidden = !module;
  if (!module) return;

  const ratio = Boolean(module.percentageMetric);
  const fhw = isFhwModule(module);
  section.classList.toggle("fhw-mode", fhw);
  $("#quantity-mode").hidden = !fhw;
  $("#quantity-reading").hidden = !fhw;
  for (const button of $("#quantity-mode").querySelectorAll?.("button") || []) {
    button.setAttribute("aria-pressed", String(button.dataset.fhwMode === state.fhwMode));
  }
  const showEvidence = !fhw && module.requireEvidence !== false;
  const oneDm = Boolean(state.filters.dm || state.filters.store);
  const showDm = !ratio && !oneDm;
  section.classList.toggle("ratio-mode", ratio);
  const shortLabel = (label) => ratio ? String(label).replace(/\s+dona$/i, "").replace(/\s+reportada$/i, "") : label;
  nav.textContent = module.activity === "Jarras Blender | Cold Foam" ? "Jarras" : module.activity;
  $("#quantity-heading").textContent = module.title;
  $("#quantity-response-table").closest("table").querySelector("thead tr").innerHTML =
    `<th>Tienda</th>${showDm ? "<th>DM</th>" : ""}${module.metrics.map((metric) => `<th>${esc(shortLabel(metric.label))}</th>`).join("")}${fhw ? "" : `<th>${esc(shortLabel(module.totalLabel || "Piezas totales"))}</th>`}${ratio ? `<th>${esc(shortLabel(module.percentageLabel))}</th>` : ""}${showEvidence ? "<th>Evidencia</th>" : ""}`;

  const eligibleStores = filteredStores().filter((store) => store.applicableActivities?.[module.activity] !== false).length;
  const responses = filteredQuantityResponses(module)
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"));
  const responseRate = eligibleStores ? responses.length / eligibleStores * 100 : 0;
  section.classList.toggle("single-store", eligibleStores === 1);
  $(".quantity-consolidation").hidden = eligibleStores === 1 && !fhw;
  const totals = Object.fromEntries(module.metrics.map((metric) => [
    metric.key,
    responses.reduce((sum, item) => sum + Number(item.quantities?.[metric.key] || 0), 0),
  ]));
  totals.total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const participation = module.percentageMetric && totals.total ? totals[module.percentageMetric] / totals.total * 100 : null;

  $("#quantity-response-chip").textContent = `${number(responses.length)} / ${number(eligibleStores)} tiendas`;
  $("#quantity-response-rate").textContent = percent(responseRate);
  $("#quantity-response-bar").style.setProperty("--progress", `${Math.min(responseRate, 100)}%`);
  $("#quantity-consolidation-title").textContent = ratio ? "Participación" : "Consolidado de respuestas";
  $("#quantity-scope").textContent = currentScope();
  $("#quantity-response-table").innerHTML = responses.length ? responses.map((item) => `<tr>
    <td><strong>${esc(item.store)}</strong><small>CeCo ${esc(item.ceco)}${ratio && !oneDm ? ` · ${esc(item.dm)}` : ""}</small></td>
    ${showDm ? `<td>${esc(item.dm)}</td>` : ""}
    ${module.metrics.map((metric) => `<td><strong>${number(item.quantities[metric.key])}</strong></td>`).join("")}
    ${fhw ? "" : `<td><strong>${number(item.quantities.total)}</strong></td>`}
    ${module.percentageMetric ? `<td><strong>${item.quantities.percentage == null ? "—" : percent(item.quantities.percentage)}</strong></td>` : ""}
    ${showEvidence ? `<td>${item.evidenceLinkPublished && item.evidenceUrl
      ? `<a class="quantity-evidence" href="${esc(item.evidenceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Abrir</a>`
      : "—"}</td>` : ""}
  </tr>`).join("") : `<tr><td colspan="${module.metrics.length + 2 - Number(fhw) + Number(showDm) + Number(ratio) + Number(showEvidence)}"><div class="empty-state">Sin respuestas válidas en este filtro.</div></td></tr>`;

  $("#quantity-totals").classList.toggle("ratio", ratio);
  const executive = fhw ? fhwSummary(module) : null;
  if (executive) {
    $("#quantity-reading").textContent = executive.label;
  }
  const totalCards = executive ? [
    ...module.metrics.map((metric) => [fhwNumber(executive.values[metric.key]), metric.label, "", ""]),
  ] : ratio ? [
    [participation == null ? "—" : percent(participation), shortLabel(module.percentageLabel),
      `${number(totals[module.percentageMetric])} de ${number(totals.total)} · ${shortLabel(module.totalLabel || "Total")}`, " featured"],
    ...module.metrics.map((metric) => [number(totals[metric.key]), shortLabel(metric.label), "", ""]),
  ] : [
    ...module.metrics.map((metric) => [number(totals[metric.key]), shortLabel(metric.label), "", ""]),
    [number(totals.total), shortLabel(module.totalLabel || "Piezas totales"), "", " total"],
  ];
  $("#quantity-totals").innerHTML = totalCards.map(([value, label, detail, style]) =>
    `<article class="quantity-total${style}"><strong>${value}</strong><span>${esc(label)}</span>${detail ? `<small>${esc(detail)}</small>` : ""}</article>`).join("");
  // Las barras vuelven a mostrar exactamente los totales de las tarjetas.
  $("#quantity-bars").hidden = true;
  $("#quantity-bars").innerHTML = "";
  const breakdowns = $("#quantity-breakdowns");
  breakdowns.hidden = true;
  if (ratio) {
    const makeTable = (title, field, groups) => `<div class="quantity-breakdown"><h4>${esc(title)}</h4><div class="table-shell quantity-group-shell"><table><thead><tr><th scope="col">${esc(field)}</th><th scope="col">Tiendas</th>${module.metrics.map((metric) => `<th scope="col">${esc(shortLabel(metric.label))}</th>`).join("")}<th scope="col">${esc(shortLabel(module.totalLabel || "Total"))}</th></tr></thead><tbody>${groups.map((group) => {
      const dm = field === "DM" ? state.data.dms?.find((item) => item.dm === group.labels[1]) : null;
      const label = field === "DM" ? dm?.shortName || group.labels[1] : group.labels[0];
      const sublabel = field === "DM" && !state.filters.region ? `<small>${esc(group.labels[0])}</small>` : "";
      return `<tr><th scope="row">${esc(label)}${sublabel}</th><td>${number(group.stores)}</td>${module.metrics.map((metric) => `<td>${metric.key === module.percentageMetric ? `<strong>${number(group.totals[metric.key])}</strong><small>${group.totals.percentage == null ? "—" : percent(group.totals.percentage)}</small>` : number(group.totals[metric.key])}</td>`).join("")}<td><strong>${number(group.totals.total)}</strong></td></tr>`;
    }).join("") || `<tr><td colspan="${module.metrics.length + 3}">Sin respuestas</td></tr>`}</tbody></table></div></div>`;
    const regions = quantityRollup(responses, module.metrics, ["region"], module.percentageMetric);
    const dms = quantityRollup(responses, module.metrics, ["region", "dm"], module.percentageMetric);
    breakdowns.innerHTML = (regions.length > 1 ? makeTable("Por región", "Región", regions) : "")
      + (dms.length > 1 ? makeTable("Por DM", "DM", dms) : "");
    breakdowns.hidden = !breakdowns.innerHTML;
  } else breakdowns.innerHTML = "";
}

function activeSurveyModule() {
  return (state.data.surveyModules || []).find((item) => item.activity === state.filters.activity) || null;
}

function filteredSurveyResponses(module) {
  return (module?.responses || []).filter((item) =>
    (!state.filters.region || item.region === state.filters.region) &&
    (!state.filters.dm || item.dm === state.filters.dm) &&
    (!state.filters.store || item.ceco === state.filters.store));
}

function responseCounts(rows, key, excludedValues = []) {
  const excluded = new Set(excludedValues);
  return rows.reduce((counts, item) => {
    const value = item.answers?.[key];
    if (!value || excluded.has(value)) return counts;
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function renderSurveyBars(counts) {
  const entries = Object.entries(counts).filter(([, value]) => Number(value) > 0);
  const maximum = Math.max(...entries.map(([, value]) => Number(value)), 1);
  return entries.map(([label, value]) => `<div><span>${esc(label)}</span><b>${number(value)}</b><i><em style="--progress:${Number(value) / maximum * 100}%"></em></i></div>`).join("");
}

function renderSurveyModule() {
  const section = $("#detalle-actividad");
  const nav = $("#survey-nav");
  const module = activeSurveyModule();
  const responses = filteredSurveyResponses(module);
  const visible = Boolean(module && responses.length);
  section.hidden = !visible;
  nav.hidden = !visible;
  if (!visible) return;

  const eligibleStores = filteredStores().length;
  const responseRate = eligibleStores ? responses.length / eligibleStores * 100 : 0;
  const primaryCounts = responseCounts(responses, module.primaryKey);
  const details = module.fields.filter((field) => field.key !== module.primaryKey);
  const changed = responses.filter((item) => item.answers?.[module.primaryKey] === "Sí");
  const breakdowns = details.map((field) => ({
    field,
    counts: responseCounts(changed, field.key, field.excludedValues || []),
  })).filter((item) => Object.keys(item.counts).length);

  $("#survey-heading").textContent = module.title;
  $("#survey-response-chip").textContent = `${number(responses.length)} de ${number(eligibleStores)} tiendas`;
  $("#survey-primary-label").textContent = module.primaryLabel;
  $("#survey-response-rate").textContent = percent(responseRate);
  $("#survey-response-bar").style.setProperty("--progress", `${Math.min(responseRate, 100)}%`);
  $("#survey-answer-bars").innerHTML = renderSurveyBars(primaryCounts);
  $("#survey-response-table").innerHTML = [...responses]
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"))
    .map((item) => `<tr><td><strong>${esc(item.store)}</strong><small>CeCo ${esc(item.ceco)}</small></td><td>${esc(item.dm)}</td><td><span class="survey-answer ${item.answers[module.primaryKey] === "Sí" ? "yes" : "no"}">${esc(item.answers[module.primaryKey])}</span></td></tr>`).join("");

  const impactPanel = $("#survey-impact-panel");
  impactPanel.hidden = changed.length === 0;
  if (!changed.length) return;
  $("#survey-detail-title").textContent = module.detailTitle;
  $("#survey-scope").textContent = currentScope();
  $("#survey-impact-count").textContent = number(changed.length);
  $("#survey-breakdowns").innerHTML = breakdowns.map(({ field, counts }) => `<section><h4>${esc(field.label)}</h4><div class="survey-bars">${renderSurveyBars(counts)}</div></section>`).join("");
  $("#survey-breakdowns").hidden = breakdowns.length === 0;
  $("#survey-impact-head").innerHTML = `<tr><th>Tienda</th><th>DM</th>${details.map((field) => `<th>${esc(field.label)}</th>`).join("")}</tr>`;
  $("#survey-impact-table").innerHTML = [...changed]
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"))
    .map((item) => `<tr><td><strong>${esc(item.store)}</strong><small>CeCo ${esc(item.ceco)}</small></td><td>${esc(item.dm)}</td>${details.map((field) => `<td>${esc(item.answers?.[field.key] || "—")}</td>`).join("")}</tr>`).join("");
}

function filteredEvidence() {
  const quantityStores = matchingQuantityStores();
  return state.data.submissions.filter((item) =>
    item.valid && item.evidenceAvailable &&
    (!quantityStores || quantityStores.has(item.ceco)) &&
    (!state.evidenceFilters.region || item.region === state.evidenceFilters.region) &&
    (!state.evidenceFilters.dm || item.dm === state.evidenceFilters.dm) &&
    (!state.evidenceFilters.store || item.ceco === state.evidenceFilters.store) &&
    (!state.evidenceFilters.activity || item.activity === state.evidenceFilters.activity));
}

function renderEvidence() {
  const rows = filteredEvidence();
  const visible = state.showAllEvidence ? rows : rows.slice(0, 6);
  const fileCount = rows.reduce((total, item) => total + (item.evidenceFiles?.length || 1), 0);
  $("#evidence-count").textContent = `${fileCount} ${fileCount === 1 ? "archivo" : "archivos"}`;
  $("#evidence-grid").innerHTML = visible.length ? visible.map((item) => `<article class="evidence-row">
    <span class="evidence-cell" data-label="Actividad"><strong>${esc(item.activity)}</strong></span>
    <span class="evidence-cell evidence-store" data-label="Tienda"><strong>${esc(item.store)}</strong><small>CeCo ${esc(item.ceco)}</small></span>
    ${item.evidenceLinkPublished && item.evidenceUrl
      ? `<div class="evidence-links" data-label="Link del archivo">${(item.evidenceFiles?.length ? item.evidenceFiles : [{url:item.evidenceUrl,fileName:item.evidenceFileName,label:"Evidencia"}]).map((file) => `<a class="evidence-link" href="${esc(file.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${esc(file.fileName)}" aria-label="Abrir ${esc(file.label)}: ${esc(file.fileName)}">${esc(item.evidenceLinkLabel)}${file.label === "Evidencia" ? "" : ` · ${esc(file.label)}`}</a>`).join("")}</div>`
      : `<span class="evidence-locked" data-label="Link del archivo">Link no disponible</span>`}
  </article>`).join("") : '<div class="empty-state">No hay evidencias para el alcance seleccionado.</div>';
  $("#evidence-toggle").hidden = rows.length <= 6;
  $("#evidence-toggle").textContent = state.showAllEvidence ? "Ver menos" : `Ver todas (${rows.length})`;
}

function dmRanking() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const activeDms = new Set(stores.map((store) => store.dm));
  return state.data.dms.filter((dm) => activeDms.has(dm.dm)).map((dm) => {
    const dmStores = stores.filter((store) => store.dm === dm.dm);
    const completed = dmStores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
    const expected = dmStores.reduce((sum, store) => sum + completionFor(store, activities).expected, 0);
    const notApplicable = dmStores.reduce((sum, store) => sum + completionFor(store, activities).notApplicable, 0);
    return { ...dm, dmStores, completed, expected, notApplicable, value: expected ? completed / expected * 100 : 0 };
  }).sort((a, b) => b.value - a.value || a.shortName.localeCompare(b.shortName, "es-MX"));
}

function exportMode() {
  return state.filters.dm || state.filters.store ? "stores" : "dms";
}

function exportRows() {
  if (exportMode() === "dms") {
    return dmRanking().map((item, index) => ({
      kind: "dm", rank: index + 1, label: item.shortName, detail: `${item.dmStores.length} tiendas`, photo: item.photo,
      completed: item.completed, expected: item.expected, notApplicable: item.notApplicable, pending: item.expected - item.completed, value: item.value,
    }));
  }
  const activities = selectedActivities();
  return filteredStores().map((store) => {
    const result = completionFor(store, activities);
    return {
      kind: "store", label: store.store, detail: `CeCo ${store.ceco}`, ceco: store.ceco, dm: store.dm,
      completed: result.completed, expected: result.expected, notApplicable: result.notApplicable, pending: result.pending, value: result.compliance,
    };
  }).sort((a, b) => b.value - a.value || b.completed - a.completed || a.label.localeCompare(b.label, "es-MX"))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

function renderTeam() {
  const rows = dmRanking();

  $("#dm-team").innerHTML = rows.map((dm, index) => {
    const signal = semaphore(dm.value);
    const rank = index < 3 ? ["🥇", "🥈", "🥉"][index] : `#${index + 1}`;
    return `<button type="button" class="dm-card ${signal.tone} ${state.filters.dm === dm.dm ? "selected" : ""}" data-dm-focus="${esc(dm.dm)}" aria-pressed="${state.filters.dm === dm.dm}" aria-label="${state.filters.dm === dm.dm ? "Quitar filtro" : "Filtrar"} de ${esc(dm.shortName)}; ${dm.dmStores.length} tiendas">
      <span class="rank-icon" aria-label="Posición ${index + 1}">${rank}</span>
      ${dm.photo
        ? `<img src="./${esc(dm.photo)}" alt="Fotografía de ${esc(dm.shortName)}" loading="lazy">`
        : `<span class="dm-avatar pending" aria-label="Fotografía pendiente">${esc(initials(dm.shortName))}</span>`}
      <span class="dm-copy"><strong>${esc(dm.shortName)}</strong><em>${dm.dmStores.length} tiendas · ${dm.expected - dm.completed} pendientes${dm.photo ? "" : " · Foto pendiente"}</em></span>
      <span class="dm-result"><strong>${percent(dm.value)}</strong><small class="status ${signal.tone}">${signal.label}</small></span>
    </button>`;
  }).join("") || '<div class="empty-state">Sin gerentes para el filtro seleccionado.</div>';
}

function renderStores() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .sort((a, b) => b.compliance - a.compliance || b.completed - a.completed || a.store.localeCompare(b.store, "es-MX"));
  $("#store-table").innerHTML = rows.length ? rows.map((store, index) => {
    const signal = semaphore(store.compliance);
    return `<tr>
      <td><span class="table-rank">${index + 1}</span></td><td><strong>${esc(store.ceco)}</strong></td><td>${esc(store.store)}</td>
      <td><strong>${store.completed}/${store.expected}</strong></td>
      <td><div class="table-progress ${signal.tone}"><span><i style="--progress:${Math.min(store.compliance, 100)}%"></i></span><b>${percent(store.compliance)}</b></div></td>
      <td><span class="status ${signal.tone}">${signal.label}</span></td>
    </tr>`;
  }).join("") : '<tr><td colspan="6"><div class="empty-state">Sin tiendas para mostrar.</div></td></tr>';
}

function syncFilterUrl() {
  const url = new URL(location.href);
  [["region", state.filters.region], ["dm", state.filters.dm], ["store", state.filters.store], ["activity", state.filters.activity], ["quantity", state.filters.quantity]].forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  });
  if (state.fhwMode === "average") url.searchParams.set("fhwView", "average");
  else url.searchParams.delete("fhwView");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readFilterUrl() {
  const params = new URLSearchParams(location.search);
  state.fhwMode = params.get("fhwView") === "average" ? "average" : "total";
  state.filters = { region: params.get("region") || "", dm: params.get("dm") || "", store: params.get("store") || "", activity: params.get("activity") || "", quantity: params.get("quantity") || "" };
}

function renderAll() {
  // El detalle general sigue disponible bajo demanda cuando la respuesta por tienda es más útil.
  const detailed = hasSelectedDetail();
  const stores = $("#store-details");
  if (stores.dataset.detailMode !== String(detailed)) {
    stores.open = !detailed;
    stores.dataset.detailMode = String(detailed);
  }
  renderSummary(); renderOrganization(); renderActivities(); renderQuantityModule(); renderSurveyModule(); renderEvidence(); renderTeam(); renderStores(); renderFilterToolbar(); syncFilterUrl();
}

function filterDisplayValue(key, value) {
  if (key === "quantity") return $("#filter-quantity").selectedOptions[0]?.textContent || value;
  if (key === "store") {
    const store = state.data.stores.find((item) => item.ceco === value);
    return store ? `${store.ceco} · ${store.store}` : value;
  }
  return value;
}

function renderFilterToolbar() {
  const labels = { region: "Región", dm: "DM", store: "Tienda", activity: "Actividad", quantity: "Subcategoría" };
  const active = Object.entries(state.filters).filter(([, value]) => value);
  const toolbar = $("#filter-toolbar");
  toolbar.hidden = active.length === 0;
  $("#selected-filter-list").innerHTML = active.map(([key, value]) =>
    `<button class="filter-chip" type="button" data-remove-filter="${key}" aria-label="Quitar ${labels[key]}: ${esc(filterDisplayValue(key, value))}"><span>${labels[key]}</span>${esc(filterDisplayValue(key, value))}<b aria-hidden="true">×</b></button>`
  ).join("");
  Object.entries(labels).forEach(([key]) => {
    $("#filter-" + key)?.closest("label")?.classList.toggle("has-value", Boolean(state.filters[key]));
  });
}

function clearDashboardFilters() {
  state.filters = { region: "", dm: "", store: "", activity: "", quantity: "" };
  state.showAllEvidence = false;
  populateFilters();
  renderAll();
}

function focusDynamicCard(attribute, value) {
  requestAnimationFrame(() => {
    const card = [...document.querySelectorAll(`[${attribute}]`)].find((item) => item.dataset[attribute.replace("data-", "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] === value);
    card?.focus({ preventScroll: true });
  });
}

function populateFilters() {
  const regions = state.data.regions || [...new Set(state.data.stores.map((store) => store.region))];
  $("#filter-region").innerHTML = '<option value="">Todos</option>' + regions.map((region) => `<option value="${esc(region)}">${esc(region)}</option>`).join("");
  if (!regions.includes(state.filters.region)) state.filters.region = "";
  $("#filter-region").value = state.filters.region;
  const regionalStores = state.data.stores.filter((store) => !state.filters.region || store.region === state.filters.region);
  const dms = [...new Set(regionalStores.map((store) => store.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#filter-dm").innerHTML = '<option value="">Todos</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  if (!dms.includes(state.filters.dm)) state.filters.dm = "";
  $("#filter-dm").value = state.filters.dm;
  const stores = regionalStores.filter((store) => !state.filters.dm || store.dm === state.filters.dm);
  $("#filter-store").innerHTML = '<option value="">Todos</option>' + stores.map((store) => `<option value="${esc(store.ceco)}">${esc(store.ceco)} · ${esc(store.store)}</option>`).join("");
  if (!stores.some((store) => store.ceco === state.filters.store)) state.filters.store = "";
  $("#filter-store").value = state.filters.store;
  $("#filter-activity").innerHTML = '<option value="">Todos</option>' + state.data.activities.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  if (!state.data.activities.some((item) => item.name === state.filters.activity)) state.filters.activity = "";
  $("#filter-activity").value = state.filters.activity;
  const numericModule = (state.data.quantityModules || []).find((item) => item.activity === state.filters.activity);
  const choices = quantityChoices(numericModule);
  $("#quantity-filter-label").hidden = !numericModule;
  $("#filter-quantity").innerHTML = '<option value="">Todas</option>' + choices.map((item) => `<option value="${esc(item.value)}">${esc(item.label)}</option>`).join("");
  if (!choices.some((item) => item.value === state.filters.quantity)) state.filters.quantity = "";
  $("#filter-quantity").value = state.filters.quantity;
}

function populateEvidenceFilters() {
  const source = state.data.submissions.filter((item) => item.valid && item.evidenceAvailable);
  const regions = [...new Set(source.map((item) => item.region))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#evidence-filter-region").innerHTML = '<option value="">Todos</option>' + regions.map((region) => `<option value="${esc(region)}">${esc(region)}</option>`).join("");
  if (!regions.includes(state.evidenceFilters.region)) state.evidenceFilters.region = "";
  $("#evidence-filter-region").value = state.evidenceFilters.region;
  const regionalSource = source.filter((item) => !state.evidenceFilters.region || item.region === state.evidenceFilters.region);
  const dms = [...new Set(regionalSource.map((item) => item.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#evidence-filter-dm").innerHTML = '<option value="">Todos</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  if (!dms.includes(state.evidenceFilters.dm)) state.evidenceFilters.dm = "";
  $("#evidence-filter-dm").value = state.evidenceFilters.dm;

  const activities = [...new Set(regionalSource.map((item) => item.activity))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#evidence-filter-activity").innerHTML = '<option value="">Todos</option>' + activities.map((activity) => `<option value="${esc(activity)}">${esc(activity)}</option>`).join("");
  if (!activities.includes(state.evidenceFilters.activity)) state.evidenceFilters.activity = "";
  $("#evidence-filter-activity").value = state.evidenceFilters.activity;

  const stores = regionalSource.filter((item) => !state.evidenceFilters.dm || item.dm === state.evidenceFilters.dm)
    .map((item) => ({ ceco: item.ceco, store: item.store }))
    .filter((item, index, rows) => rows.findIndex((row) => row.ceco === item.ceco) === index)
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"));
  $("#evidence-filter-store").innerHTML = '<option value="">Todos</option>' + stores.map((item) => `<option value="${esc(item.ceco)}">${esc(item.ceco)} · ${esc(item.store)}</option>`).join("");
  if (!stores.some((item) => item.ceco === state.evidenceFilters.store)) state.evidenceFilters.store = "";
  $("#evidence-filter-store").value = state.evidenceFilters.store;
}

function fileSafe(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function spreadsheetColumn(column) {
  let value = column;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function reportScope() {
  return state.filters.store ? `Tienda · ${currentScope()}` : state.filters.dm ? `DM · ${state.filters.dm}` : `Región · ${state.filters.region || state.data.region}`;
}

function exportActivityLabel() {
  const activity = state.filters.activity || "Todas las actividades";
  const module = (state.data.quantityModules || []).find((item) => item.activity === state.filters.activity);
  const choice = quantityChoices(module).find((item) => item.value === state.filters.quantity);
  const label = choice ? `${activity} · ${choice.label}` : activity;
  return isFhwModule(module) ? `${label} · ${state.fhwMode === "average" ? "Promedio" : "Total"}` : label;
}

function exportAdvanceLabel() {
  if (state.filters.store) return "AVANCE TIENDA";
  if (state.filters.dm) return "AVANCE DM";
  return "AVANCE REGIÓN";
}

function exportScopeSummary() {
  const item = metrics();
  if (state.filters.store) {
    return `Tienda · ${currentScope()} · ${number(item.pending)} pendientes`;
  }
  if (state.filters.dm) {
    return `DM · ${state.filters.dm} · ${number(item.stores)} tiendas · ${number(item.pending)} pendientes`;
  }
  return `Región · ${state.filters.region || state.data.region} · ${number(item.stores)} tiendas · ${number(item.pending)} pendientes`;
}

function exportContext(format) {
  const item = metrics();
  const activity = exportActivityLabel();
  const type = state.filters.store ? "Tienda" : state.filters.dm ? "DM" : "Regional";
  const name = state.filters.store ? currentScope() : state.filters.dm || state.filters.region || state.data.region;
  const filename = `Sistema_Evidencia_OPS_${type}_${fileSafe(name)}_${fileSafe(activity)}_Corte_${cutDate().replaceAll("/", "-")}.${format}`;
  return {
    item, activity, type, name, filename,
    summary: isFhwModule() ? (() => {
      const summary = fhwSummary();
      return [["Alcance", `${type} · ${name}`], ["Actividad", activity],
        ["Lectura", summary.label],
        ...summary.module.metrics.map((metric) => [metric.label, fhwNumber(summary.values[metric.key])])];
    })() : [
      ["Alcance", `${type} · ${name}`],
      ["Actividad", activity],
      ["Tiendas", number(item.stores)],
      ["Pendientes", number(item.pending)],
      ["Avance", `${number(item.completed)} / ${number(item.expected)} · ${percent(item.compliance)}`],
    ],
  };
}

async function exportPdf() {
  if (!await beginExport("PDF")) return;
  try {
    await loadExportEngine("pdf");
    if (!window.OPSPdf) throw new Error("El motor PDF no está disponible.");
    const context = exportContext("pdf");
    const canvases = await renderPdfPages();
    const result = await window.OPSPdf.downloadCanvases(canvases, context.filename);
    finishExport(context.filename, result.url);
  } catch (error) {
    failExport(error);
  }
}

function loadImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = source;
  });
}

function drawCover(context, image, x, y, width, height) {
  if (!image) return;
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale; const sh = height / scale;
  context.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, width, height);
}

function fitText(context, value, maxWidth) {
  const text = String(value ?? "");
  if (context.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && context.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}…`;
}

function renderFhwReportPages() {
  const summary = fhwSummary();
  const canvas = document.createElement("canvas");
  canvas.width = 1600; canvas.height = 1131;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f7f5"; context.fillRect(0, 0, 1600, 1131);
  context.fillStyle = "#006241"; context.fillRect(0, 0, 1600, 215);
  context.fillStyle = "#cce5d9"; context.font = "700 23px Segoe UI, sans-serif";
  context.fillText("EVIDENCIAS OPS · FHW", 65, 54);
  context.fillStyle = "#ffffff"; context.font = "800 48px Segoe UI, sans-serif";
  context.fillText(summary.label, 65, 118);
  context.font = "600 27px Segoe UI, sans-serif";
  context.fillText(fitText(context, reportScope(), 1470), 65, 169);
  context.fillStyle = "#42564d"; context.font = "600 23px Segoe UI, sans-serif";
  context.fillText(fitText(context, `Cantidad: ${quantityChoices(summary.module).find((choice) => choice.value === state.filters.quantity)?.label || "Todas"} · Corte ${cutStamp()}`, 1470), 65, 261);
  const cards = summary.module.metrics.map((metric) => [metric.label, summary.values[metric.key]]);
  cards.forEach(([label, value], index) => {
    const x = 65 + index * 750;
    context.fillStyle = "#ffffff"; context.fillRect(x, 310, 720, 242);
    context.fillStyle = "#006241"; context.font = "800 70px Segoe UI, sans-serif";
    context.fillText(fhwNumber(value, summary.mode), x + 30, 414);
    context.font = "700 27px Segoe UI, sans-serif"; context.fillText(label, x + 30, 476);
    context.font = "500 20px Segoe UI, sans-serif";
    context.fillText(summary.mode === "average" ? "piezas / tienda con respuesta" : "piezas reportadas", x + 30, 516);
  });
  const baseCards = [["CON RESPUESTA", number(summary.answered)], ["SIN RESPUESTA", number(summary.pending)],
    ["COBERTURA DEL FILTRO", summary.coverage == null ? "—" : percent(summary.coverage)]];
  baseCards.forEach(([label, value], index) => {
    const x = 65 + index * 497;
    context.fillStyle = "#e2eee7"; context.fillRect(x, 602, 472, 155);
    context.fillStyle = "#42564d"; context.font = "700 20px Segoe UI, sans-serif"; context.fillText(label, x + 30, 647);
    context.fillStyle = "#1e3932"; context.font = "800 45px Segoe UI, sans-serif"; context.fillText(value, x + 30, 713);
  });
  context.fillStyle = "#1e3932"; context.font = "700 26px Segoe UI, sans-serif";
  context.font = "500 21px Segoe UI, sans-serif";
  context.fillText("Región, DM, tienda y cantidad corresponden al filtro seleccionado.", 65, 932);
  context.fillStyle = "#1e3932"; context.fillRect(0, 1015, 1600, 116);
  context.fillStyle = "#ffffff"; context.font = "700 24px Segoe UI, sans-serif";
  context.fillText("Starbucks México · Revisión ejecutiva FHW", 65, 1073);
  return [canvas];
}

async function downloadReportImage(canvas) {
  const exportInfo = exportContext("png");
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No fue posible crear la imagen.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = exportInfo.filename; document.body.appendChild(link); link.click(); link.remove();
  finishExport(exportInfo.filename, url);
}

async function renderPdfPages() {
  if (isFhwModule()) return renderFhwReportPages();
  const rows = exportRows();
  const meta = reportMeta();
  const current = metrics();
  const mode = exportMode();
  const profile = exportProfile();
  const sources = ["./assets/icons/icon-192.webp", `./${profile.photo}`, ...rows.map((item) => item.photo ? `./${item.photo}` : "")];
  const loaded = await Promise.all(sources.map((source) => source ? loadImage(source) : Promise.resolve(null)));
  const [logo, profilePhoto, ...photos] = loaded;
  const rowHeight = mode === "dms" ? 92 : 58;
  const rowsPerPage = mode === "dms" ? 6 : 11;
  const chunks = [];
  for (let index = 0; index < Math.max(rows.length, 1); index += rowsPerPage) chunks.push(rows.slice(index, index + rowsPerPage));

  return chunks.map((pageRows, pageIndex) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 1131;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f5f8f6"; context.fillRect(0, 0, 1600, 1131);
    context.fillStyle = "#006241"; context.fillRect(0, 0, 1600, 205);
    if (logo) context.drawImage(logo, 45, 48, 112, 112);
    context.textAlign = "center";
    context.fillStyle = "#ffffff"; context.font = "800 37px Segoe UI, sans-serif"; context.fillText(meta.title, 730, 56);
    context.fillStyle = "#ffffff"; context.font = "850 30px Segoe UI, sans-serif"; context.fillText(fitText(context, exportActivityLabel(), 760), 730, 116);
    context.fillStyle = "#b9e1d0"; context.font = "650 14px Segoe UI, sans-serif"; context.fillText(`Corte ${cutStamp()}`, 730, 154);
    context.textAlign = "left";

    if (profilePhoto) {
      context.save(); context.beginPath(); context.arc(1220, 88, 46, 0, Math.PI * 2); context.clip(); drawCover(context, profilePhoto, 1174, 42, 92, 92); context.restore();
      context.fillStyle = "#ffffff"; context.font = "750 15px Segoe UI, sans-serif"; context.fillText(profile.name, 1164, 157);
      context.fillStyle = "#b9e1d0"; context.font = "650 12px Segoe UI, sans-serif"; context.fillText(profile.role, 1164, 176);
    }
    context.fillStyle = "#ffffff"; context.globalAlpha = .13; context.fillRect(1320, 41, 225, 122); context.globalAlpha = 1;
    context.textAlign = "center"; context.fillStyle = "#b9e1d0"; context.font = "800 13px Segoe UI, sans-serif"; context.fillText(exportAdvanceLabel(), 1432, 69);
    context.fillStyle = "#ffffff"; context.font = "900 45px Segoe UI, sans-serif"; context.fillText(percent(current.compliance), 1432, 121);
    context.textAlign = "left";
    const cards = [
      ["AVANCE REALIZADO", `${number(current.completed)} / ${number(current.expected)}`, 55, 730],
      ["PENDIENTES", number(current.pending), 815, 730],
    ];
    cards.forEach(([label, value, x, width], cardIndex) => {
      context.fillStyle = "#ffffff"; context.fillRect(x, 225, width, 82);
      context.textAlign = "center";
      context.fillStyle = "#5d7067"; context.font = "750 14px Segoe UI, sans-serif"; context.fillText(label, x + width / 2, 252);
      context.fillStyle = "#1e3932"; context.font = "850 28px Segoe UI, sans-serif"; context.fillText(value, x + width / 2, 289);
      context.textAlign = "left";
    });

    const tableTop = 330;
    context.fillStyle = "#1e3932"; context.fillRect(55, tableTop, 1490, 55);
    context.fillStyle = "#ffffff"; context.font = "750 14px Segoe UI, sans-serif";
    const headers = [["RANKING", 75], [mode === "dms" ? "DM" : "TIENDA / CECO", 185], ["AVANCE REALIZADO", 960], ["PENDIENTES", 1260], ["% AVANCE", 1390]];
    headers.forEach(([label, x]) => context.fillText(label, x, tableTop + 34));

    pageRows.forEach((item, localIndex) => {
      const globalIndex = pageIndex * rowsPerPage + localIndex;
      const y = tableTop + 55 + localIndex * rowHeight;
      const signal = semaphore(item.value);
      context.fillStyle = localIndex % 2 ? "#f1f6f3" : "#ffffff"; context.fillRect(55, y, 1490, rowHeight - 2);
      context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#c98612" : "#c54435"; context.fillRect(55, y, 8, rowHeight - 2);
      context.fillStyle = "#006241"; context.font = "850 17px Segoe UI, sans-serif"; context.fillText(String(item.rank), 91, y + rowHeight / 2 + 6);
      let labelX = 185;
      if (item.photo && photos[globalIndex]) {
        context.save(); context.beginPath(); context.arc(202, y + rowHeight / 2, 31, 0, Math.PI * 2); context.clip(); drawCover(context, photos[globalIndex], 171, y + rowHeight / 2 - 31, 62, 62); context.restore();
        labelX = 250;
      }
      context.fillStyle = "#1e3932"; context.font = `750 ${mode === "dms" ? 22 : 18}px Segoe UI, sans-serif`; context.fillText(fitText(context, item.label, 650), labelX, y + rowHeight / 2 - (mode === "dms" ? 4 : -6));
      if (mode === "dms") { context.fillStyle = "#687970"; context.font = "500 15px Segoe UI, sans-serif"; context.fillText(item.detail, labelX, y + rowHeight / 2 + 22); }
      context.fillStyle = "#1e3932"; context.font = "800 20px Segoe UI, sans-serif"; context.fillText(`${number(item.completed)} / ${number(item.expected)}`, 1005, y + rowHeight / 2 + 7);
      context.fillText(number(item.pending), 1280, y + rowHeight / 2 + 7);
      context.fillStyle = signal.tone === "green" ? "#116444" : signal.tone === "amber" ? "#80520c" : "#922f24"; context.font = "850 20px Segoe UI, sans-serif";
      context.fillText(percent(item.value), 1410, y + rowHeight / 2 + 7);
    });

    context.fillStyle = "#1e3932"; context.fillRect(55, 1055, 1490, 50);
    context.fillStyle = "#ffffff"; context.font = "750 15px Segoe UI, sans-serif"; context.fillText(meta.motto, 75, 1086);
    context.textAlign = "right"; context.fillStyle = "#cce0d7"; context.font = "500 13px Segoe UI, sans-serif"; context.fillText(meta.footerLabel || "Starbucks México · Operaciones", 1525, 1086); context.textAlign = "left";
    return canvas;
  });
}

async function exportImage() {
  if (!await beginExport("imagen")) return;
  try {
    if (isFhwModule()) {
      await downloadReportImage(renderFhwReportPages()[0]);
      return;
    }
    const rows = exportRows();
    const meta = reportMeta();
    const current = metrics();
    const mode = exportMode();
    const profile = exportProfile();
    const width = 1600; const headerHeight = 230; const tableHeader = 72; const rowHeight = mode === "dms" ? 148 : 108; const footerHeight = 110;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = headerHeight + tableHeader + Math.max(rows.length, 1) * rowHeight + footerHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f6f8f7"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#006241"; context.fillRect(0, 0, width, headerHeight);
    const assets = await Promise.all([loadImage("./assets/icons/icon-192.webp"), loadImage(`./${profile.photo}`), ...rows.map((item) => item.photo ? loadImage(`./${item.photo}`) : Promise.resolve(null))]);
    const [logo, profilePhoto, ...photos] = assets;
    if (logo) context.drawImage(logo, 48, 55, 112, 112);
    context.textAlign = "center";
    context.fillStyle = "#ffffff"; context.font = "700 40px Segoe UI, sans-serif"; context.fillText(meta.title, 730, 58);
    context.font = "850 32px Segoe UI, sans-serif"; context.fillText(fitText(context, exportActivityLabel(), 760), 730, 119);
    context.fillStyle = "#b9e1d0"; context.font = "650 14px Segoe UI, sans-serif"; context.fillText(`Corte ${cutStamp()}`, 730, 158);
    context.textAlign = "left";
    if (profilePhoto) {
      context.save(); context.beginPath(); context.arc(1220, 91, 43, 0, Math.PI * 2); context.clip(); drawCover(context, profilePhoto, 1177, 48, 86, 86); context.restore();
      context.fillStyle = "#ffffff"; context.font = "700 15px Segoe UI, sans-serif"; context.fillText(profile.name, 1165, 160);
      context.fillStyle = "#b9e1d0"; context.font = "600 13px Segoe UI, sans-serif"; context.fillText(profile.role, 1165, 181);
    }
    context.fillStyle = "#ffffff"; context.globalAlpha = .13; context.fillRect(1320, 42, 225, 132); context.globalAlpha = 1;
    context.textAlign = "center"; context.fillStyle = "#b9e1d0"; context.font = "800 13px Segoe UI, sans-serif"; context.fillText(exportAdvanceLabel(), 1432, 72);
    context.fillStyle = "#ffffff"; context.font = "900 48px Segoe UI, sans-serif"; context.fillText(percent(current.compliance), 1432, 127);
    context.textAlign = "left";
    context.textAlign = "left";
    const top = headerHeight; context.fillStyle = "#e5efea"; context.fillRect(0, top, width, tableHeader);
    context.fillStyle = "#42564d"; context.font = "700 17px Segoe UI, sans-serif";
    context.fillText("RANKING", 70, top + 45); context.fillText(mode === "dms" ? "DM" : "TIENDA / CECO", 190, top + 45); context.fillText("AVANCE REALIZADO", 960, top + 45); context.fillText("PENDIENTES", 1270, top + 45); context.fillText("% AVANCE", 1400, top + 45);
    rows.forEach((item, index) => {
      const y = top + tableHeader + index * rowHeight; const signal = semaphore(item.value); const centerY = y + rowHeight / 2;
      context.fillStyle = index % 2 ? "#f4f7f5" : "#ffffff"; context.fillRect(0, y, width, rowHeight - 2);
      context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#c98612" : "#c54435"; context.fillRect(0, y, 12, rowHeight - 2);
      context.fillStyle = "#edf3f0"; context.beginPath(); context.arc(95, centerY, 25, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#006241"; context.font = "800 20px Segoe UI, sans-serif"; context.textAlign = "center"; context.fillText(String(item.rank), 95, centerY + 7); context.textAlign = "left";
      let labelX = 190;
      if (item.photo) {
        context.save(); context.beginPath(); context.arc(165, centerY, 39, 0, Math.PI * 2); context.clip(); drawCover(context, photos[index], 126, centerY - 39, 78, 78); context.restore();
        labelX = 225;
      }
      context.fillStyle = "#1e3932"; context.font = `${mode === "dms" ? 700 : 650} ${mode === "dms" ? 27 : 23}px Segoe UI, sans-serif`; context.fillText(item.label, labelX, centerY - 4);
      context.fillStyle = "#65756d"; context.font = "400 18px Segoe UI, sans-serif"; context.fillText(item.detail, labelX, centerY + 24);
      context.fillStyle = "#1e3932"; context.font = "700 28px Segoe UI, sans-serif"; context.fillText(`${number(item.completed)} / ${number(item.expected)}`, 1000, centerY + 10);
      context.fillText(number(item.pending), 1290, centerY + 10);
      context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#a86b0a" : "#a2352a"; context.font = "800 31px Segoe UI, sans-serif"; context.fillText(percent(item.value), 1410, centerY + 10);
    });
    const footerY = canvas.height - footerHeight; context.fillStyle = "#1e3932"; context.fillRect(0, footerY, width, footerHeight);
    context.fillStyle = "#ffffff"; context.font = "800 23px Segoe UI, sans-serif"; context.fillText(meta.motto, 72, footerY + 48);
    context.textAlign = "right"; context.fillStyle = "#cce0d7"; context.font = "400 18px Segoe UI, sans-serif"; context.fillText(meta.footerLabel || "Starbucks México · Operaciones", 1525, footerY + 64); context.textAlign = "left";
    await downloadReportImage(canvas);
  } catch (error) {
    failExport(error);
  }
}

function setExportButtonsDisabled(disabled) {
  ["#export-image", "#export-pdf", "#export-excel"].forEach((selector) => { $(selector).disabled = disabled; });
}

async function beginExport(format) {
  if (state.exporting || !state.data) return false;
  state.exporting = true;
  setExportButtonsDisabled(true);
  const modal = $("#export-modal");
  const card = modal.querySelector(".export-card");
  card.classList.remove("complete");
  $("#export-modal-image").src = "./assets/ui/Damos_Seguimiento.webp";
  $("#export-modal-image").alt = "Le damos seguimiento, estamos trabajando para ti";
  $("#export-modal-kicker").textContent = `Exportar ${format}`;
  $("#export-modal-title").textContent = "Confirma los datos del filtro";
  $("#export-modal-message").textContent = "Al aceptar, el archivo se descargará directamente con este alcance:";
  $("#export-modal-summary").innerHTML = exportContext(format.toLowerCase() === "excel" ? "xlsx" : format.toLowerCase()).summary
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  $("#export-progress").hidden = true;
  $("#export-modal-accept").textContent = "Aceptar y descargar";
  $("#export-modal-accept").hidden = false;
  $("#export-modal-cancel").hidden = false;
  $("#export-modal-close").hidden = true;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  $("#export-modal-accept").focus();
  const accepted = await new Promise((resolve) => { state.exportDecision = resolve; });
  state.exportDecision = null;
  if (!accepted) {
    state.exporting = false; setExportButtonsDisabled(false); modal.hidden = true; document.body.style.overflow = "";
    return false;
  }
  $("#export-modal-accept").hidden = true;
  $("#export-modal-cancel").hidden = true;
  $("#export-progress").hidden = false;
  $("#export-modal-kicker").textContent = `Preparando ${format}`;
  $("#export-modal-title").textContent = "Estamos creando tu reporte";
  $("#export-modal-message").textContent = "La descarga iniciará automáticamente en unos segundos.";
  await new Promise((resolve) => setTimeout(resolve, 250));
  return accepted;
}

function acceptExportConfirmation() {
  if (state.exportDecision) state.exportDecision(true);
}

function cancelExportConfirmation() {
  if (state.exportDecision) state.exportDecision(false);
}

function finishExport(filename, url = "") {
  const modal = $("#export-modal");
  const extension = filename.split(".").pop().toLowerCase();
  const formatLabel = extension === "xlsx" ? "Excel" : extension === "pdf" ? "PDF" : "imagen";
  modal.hidden = false;
  modal.querySelector(".export-card").classList.add("complete");
  $("#export-modal-image").src = "./assets/ui/Un_placer_haber_Ayudado.webp";
  $("#export-modal-image").alt = "Un placer haber ayudado";
  $("#export-modal-kicker").textContent = "Descarga completada";
  $("#export-modal-title").textContent = "Valida tu archivo";
  $("#export-modal-message").textContent = `Tu archivo ${formatLabel} ya se descargó. Abre tu carpeta Descargas y confirma el nombre antes de cerrar.`;
  $("#export-modal-summary").innerHTML = [
    ["Ubicación", "Carpeta Descargas"],
    ["Archivo", filename],
  ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  $("#export-progress").hidden = true;
  $("#export-modal-accept").hidden = true;
  $("#export-modal-cancel").hidden = true;
  if (state.exportUrl && state.exportUrl !== url) URL.revokeObjectURL(state.exportUrl);
  state.exportUrl = url;
  $("#export-modal-close").hidden = false;
  state.exporting = false;
  setExportButtonsDisabled(false);
  document.body.style.overflow = "hidden";
  $("#export-modal-close").focus();
}

function failExport(error) {
  const modal = $("#export-modal");
  modal.hidden = false;
  modal.querySelector(".export-card").classList.add("complete");
  $("#export-modal-kicker").textContent = "No fue posible exportar";
  $("#export-modal-title").textContent = "Revisa e intenta nuevamente";
  $("#export-modal-message").textContent = error?.message || "Ocurrió un error inesperado.";
  $("#export-modal-summary").innerHTML = "";
  $("#export-progress").hidden = true;
  $("#export-modal-accept").hidden = true;
  $("#export-modal-cancel").hidden = true;
  $("#export-modal-close").hidden = false;
  state.exporting = false;
  setExportButtonsDisabled(false);
}

function closeExportModal() {
  if (state.exporting) return;
  if (state.exportUrl) URL.revokeObjectURL(state.exportUrl);
  state.exportUrl = "";
  $("#export-modal").hidden = true;
  document.body.style.overflow = "";
  $("#export-image").focus();
}

function buildFhwExcelSpec() {
  const summary = fhwSummary();
  const scope = currentScope();
  const rowValue = (value) => value == null ? "" : {value: summary.mode === "average" ? Math.round(value * 10) / 10 : value, style: 5};
  const quantityRows = summary.responses.slice().sort((a, b) => a.store.localeCompare(b.store, "es-MX"))
    .map((item) => [item.ceco, item.store, item.dm,
      ...summary.module.metrics.map((metric) => Number(item.quantities[metric.key] || 0))]);
  const columns = 3 + summary.module.metrics.length;
  return {title: `FHW · ${summary.label} · ${scope}`, sheets: [{
    name: "Resumen FHW",
    rows: [[`FHW · ${summary.label}`, "", ""], [`${scope} · Corte ${cutStamp()}`, "", ""],
      ["Cantidades correspondientes al filtro seleccionado", "", ""], ["Indicador", "Valor", "Lectura"],
      ...summary.module.metrics.map((metric) => [metric.label, rowValue(summary.values[metric.key]), summary.mode === "average" ? "Piezas por tienda con respuesta" : "Piezas en el filtro"]),
      ["Tiendas con respuesta", summary.answered, "Base del promedio; incluye ceros"],
      ["Tiendas en el filtro", summary.eligible, "Tiendas donde aplica FHW"],
      ["Tiendas sin respuesta", summary.pending, "Se excluyen del promedio"],
      ["Cobertura", summary.coverage == null ? "" : {value: summary.coverage / 100, style: 3}, "Con respuesta / tiendas en el filtro"]],
    widths: [30, 20, 65], merges: ["A1:C1", "A2:C2", "A3:C3"], headerRows: [4], freezeRow: 4, tabColor: "FF006241",
  }, {
    name: "FHW tiendas",
    rows: [["Conteo reportado por tienda", ...Array(columns - 1).fill("")], [`${scope} · Corte ${cutStamp()}`, ...Array(columns - 1).fill("")],
      ["Conteos originales; el modo Total / Promedio aplica al resumen.", ...Array(columns - 1).fill("")],
      ["CeCo", "Tienda", "DM", ...summary.module.metrics.map((metric) => metric.label)], ...quantityRows],
    widths: [13, 32, 32, ...summary.module.metrics.map(() => 20)],
    merges: [1, 2, 3].map((row) => `A${row}:${spreadsheetColumn(columns)}${row}`), headerRows: [4],
    countColumns: summary.module.metrics.map((_, index) => index + 4), freezeRow: 4,
    autoFilter: `A4:${spreadsheetColumn(columns)}${4 + quantityRows.length}`, tabColor: "FF006241",
  }]};
}

function buildExcelSpec() {
  if (isFhwModule()) return buildFhwExcelSpec();
  const item = metrics();
  const rows = exportRows();
  const mode = exportMode();
  const scope = reportScope();
  const activityLabel = exportActivityLabel();
  const stores = filteredStores();
  const activities = state.data.activities.filter((activity) => !state.filters.activity || activity.name === state.filters.activity);
  const executiveDecision = (value) => value >= 80
    ? { status: "En meta", action: "Mantener estándar", style: 9 }
    : value >= 40
      ? { status: "Seguimiento", action: "Dar seguimiento", style: 10 }
      : { status: "Atención", action: "Priorizar hoy", style: 11 };
  const detailHeaders = mode === "dms"
    ? ["Ranking", "DM", "Realizadas", "Pendientes", "% Avance", "Estado", "Decisión"]
    : ["CeCo", "Tienda", ...activities.map((activity) => activity.name), "Realizadas", "Pendientes", "% Avance", "Estado", "Decisión"];
  const activityStartColumn = 3;
  const activityEndColumn = activityStartColumn + activities.length - 1;
  const completedColumn = activityEndColumn + 1;
  const pendingColumn = completedColumn + 1;
  const advanceColumn = pendingColumn + 1;
  const statusColumn = advanceColumn + 1;
  const decisionColumn = statusColumn + 1;
  const storesByCeco = new Map(stores.map((store) => [store.ceco, store]));
  const matrixStores = rows.map((row) => storesByCeco.get(row.ceco)).filter(Boolean);
  const detailRows = mode === "dms" ? rows.map((row) => {
    const decision = executiveDecision(row.value);
    return [row.rank, row.label, row.completed, row.pending, row.value / 100, { value: decision.status, style: decision.style }, { value: decision.action, style: decision.style }];
  }) : matrixStores.map((store, index) => {
    const rowNumber = index + 5;
    const result = completionFor(store, activities.map((activity) => activity.name));
    const decision = executiveDecision(result.compliance);
    const activityValues = activities.map((activity) => store.applicableActivities?.[activity.name] === false
      ? { value: "", style: 0 }
      : { value: store.activities[activity.name] ? 1 : 0, style: store.activities[activity.name] ? 7 : 8 });
    const activityRange = `${spreadsheetColumn(activityStartColumn)}${rowNumber}:${spreadsheetColumn(activityEndColumn)}${rowNumber}`;
    return [
      store.ceco,
      store.store,
      ...activityValues,
      { formula: `SUM(${activityRange})`, cached: result.completed, style: 6 },
      { formula: `COUNT(${activityRange})-SUM(${activityRange})`, cached: result.pending, style: 6 },
      { formula: `IFERROR(SUM(${activityRange})/COUNT(${activityRange}),0)`, cached: result.compliance / 100, style: 3 },
      { value: decision.status, style: decision.style },
      { value: decision.action, style: decision.style },
    ];
  });
  const activityRows = activities.map((activity, index) => {
    const progress = stores.map((store) => completionFor(store, [activity.name]));
    const completed = progress.reduce((sum, row) => sum + row.completed, 0);
    const expected = progress.reduce((sum, row) => sum + row.expected, 0);
    const pending = expected - completed;
    const value = expected ? completed / expected : 0;
    const decision = executiveDecision(value * 100);
    return [index + 1, activity.name, completed, pending, value, activity.commitmentDateDisplay || "Sin fecha", { value: decision.status, style: decision.style }, { value: decision.action, style: decision.style }];
  });
  const quantityModule = activeQuantityModule();
  const quantityResponses = quantityModule ? filteredQuantityResponses(quantityModule) : [];
  const ratioModule = Boolean(quantityModule?.percentageMetric);
  const quantityEvidence = quantityModule?.requireEvidence !== false;
  const quantityRows = quantityModule ? quantityResponses
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"))
    .map((item) => [
      item.ceco, item.store, ...ratioModule ? [item.region] : [], item.dm,
      ...quantityModule.metrics.map((metric) => Number(item.quantities[metric.key] || 0)),
      Number(item.quantities.total || 0), ...ratioModule ? [item.quantities.percentage == null ? "" : {value: item.quantities.percentage / 100, style: 3}] : [],
      ...quantityEvidence ? [item.evidenceLinkPublished ? item.evidenceUrl : ""] : [],
    ]) : [];
  const evidenceRows = state.data.submissions
    .filter((entry) => entry.valid && entry.evidenceLinkPublished && storesByCeco.has(entry.ceco)
      && (!state.filters.activity || entry.activity === state.filters.activity))
    .flatMap((entry) => (entry.evidenceFiles?.length ? entry.evidenceFiles : [{label:"Evidencia",fileName:entry.evidenceFileName,url:entry.evidenceUrl}])
      .map((file) => [entry.ceco, entry.store, entry.activity, file.label, file.fileName, file.url]));
  return {
    title: `Sistema de Evidencias OPS · ${scope} · ${activityLabel}`,
    sheets: [
      {
        name: "Resumen",
        rows: [
          ["Sistema de Evidencias OPS", "", "", ""],
          [`${scope} · ${activityLabel} · Corte ${cutStamp()}`, "", "", ""],
          [],
          ["Indicador", "Valor", "Lectura ejecutiva", "Decisión"],
          ["Realizadas", item.completed, "Actividades concluidas en el filtro actual", { value: "Mantener avance", style: 9 }],
          ["Pendientes", item.pending, "Actividades que aún requieren ejecución", { value: item.pending ? "Cerrar brechas" : "Sin pendientes", style: item.pending ? 10 : 9 }],
          [exportAdvanceLabel(), { value: item.compliance / 100, style: 3 }, `${item.completed} de ${item.expected} en el filtro actual`, { value: executiveDecision(item.compliance).action, style: executiveDecision(item.compliance).style }],
        ],
        widths: [24, 18, 44, 22], merges: ["A1:D1", "A2:D2"], headerRows: [4], countColumns: [2], freezeRow: 4, autoFilter: "A4:D7", tabColor: "FF006241",
      },
      {
        name: mode === "dms" ? "Ranking DM" : "Tiendas",
        rows: [[mode === "dms" ? "Ranking DM" : "Detalle de actividades por tienda", ...Array(detailHeaders.length - 1).fill("")], [`${scope} · ${activityLabel} · Corte ${cutStamp()}`, ...Array(detailHeaders.length - 1).fill("")], [mode === "dms" ? "" : "1 = Realizada · 0 = Pendiente", ...Array(detailHeaders.length - 1).fill("")], detailHeaders, ...detailRows],
        widths: mode === "dms" ? [10, 32, 14, 14, 14, 16, 20] : [13, 28, ...activities.map((activity) => Math.max(16, Math.min(36, activity.name.length + 3))), 14, 14, 14, 16, 20],
        merges: mode === "dms"
          ? ["A1:G1", "A2:G2"]
          : [`A1:${spreadsheetColumn(decisionColumn)}1`, `A2:${spreadsheetColumn(decisionColumn)}2`, `A3:${spreadsheetColumn(decisionColumn)}3`],
        headerRows: [4],
        percentColumns: [mode === "dms" ? 5 : advanceColumn],
        countColumns: mode === "dms" ? [1, 3, 4] : [...activities.map((_, index) => activityStartColumn + index), completedColumn, pendingColumn],
        freezeRow: 4,
        autoFilter: `A4:${spreadsheetColumn(mode === "dms" ? 7 : decisionColumn)}${4 + detailRows.length}`,
        tabColor: "FF004C3F",
      },
      {
        name: "Actividades",
        rows: [["Avance por actividad", "", "", "", "", "", "", ""], [`${scope} · Corte ${cutStamp()}`, "", "", "", "", "", "", ""], [], ["Orden", "Actividad", "Realizadas", "Pendientes", "% Avance", "Fecha compromiso", "Estado", "Decisión"], ...activityRows],
        widths: [10, 40, 14, 14, 14, 20, 16, 20], merges: ["A1:H1", "A2:H2"], headerRows: [4], percentColumns: [5], freezeRow: 4, autoFilter: `A4:H${4 + activityRows.length}`, tabColor: "FF16845B",
      },
      {
        name: "Evidencias",
        rows: [["Evidencias verificadas", "", "", "", "", ""], [`${scope} · ${activityLabel}`, "", "", "", "", ""], [], ["CeCo", "Tienda", "Actividad", "Etapa", "Archivo", "Vínculo"], ...evidenceRows],
        widths: [13, 32, 42, 16, 45, 80], merges: ["A1:F1", "A2:F2"], headerRows: [4], freezeRow: 4, autoFilter: `A4:F${4 + evidenceRows.length}`, tabColor: "FF16845B",
      },
      ...(quantityModule ? [{
        name: quantityModule.activity === "Jarras Blender | Cold Foam" ? "Jarras" : quantityModule.activity,
        rows: [[quantityModule.title, ...Array(quantityModule.metrics.length + (ratioModule ? 5 : 3) + Number(quantityEvidence)).fill("")], [`${scope} · Corte ${cutStamp()}`, ...Array(quantityModule.metrics.length + (ratioModule ? 5 : 3) + Number(quantityEvidence)).fill("")], [], ["CeCo", "Tienda", ...ratioModule ? ["Región"] : [], "DM", ...quantityModule.metrics.map((metric) => metric.label), quantityModule.totalLabel || "Piezas totales", ...ratioModule ? [quantityModule.percentageLabel] : [], ...quantityEvidence ? ["Evidencia"] : []], ...quantityRows],
        widths: [13, 30, ...ratioModule ? [18] : [], 32, ...quantityModule.metrics.map(() => 20), 20, ...ratioModule ? [16] : [], ...quantityEvidence ? [42] : []], merges: [`A1:${spreadsheetColumn(quantityModule.metrics.length + (ratioModule ? 6 : 4) + Number(quantityEvidence))}1`, `A2:${spreadsheetColumn(quantityModule.metrics.length + (ratioModule ? 6 : 4) + Number(quantityEvidence))}2`], headerRows: [4], countColumns: quantityModule.metrics.map((_, index) => index + (ratioModule ? 5 : 4)).concat(quantityModule.metrics.length + (ratioModule ? 5 : 4)), percentColumns: ratioModule ? [quantityModule.metrics.length + 6] : [], freezeRow: 4, autoFilter: `A4:${spreadsheetColumn(quantityModule.metrics.length + (ratioModule ? 6 : 4) + Number(quantityEvidence))}${4 + quantityRows.length}`, tabColor: "FFD8A243",
      }] : []),
      ...(ratioModule ? [{
        name: "Participación",
        rows: [["Participación por región y DM", ...Array(quantityModule.metrics.length + 3).fill("")], [`${scope} · Corte ${cutStamp()}`, ...Array(quantityModule.metrics.length + 3).fill("")], [], ["Región / DM", "Tiendas", ...quantityModule.metrics.map((metric) => metric.label.replace(/\s+dona$/i, "")), String(quantityModule.totalLabel).replace(/\s+reportada$/i, ""), String(quantityModule.percentageLabel).replace(/\s+dona$/i, "")],
          ...[["Región", quantityRollup(quantityResponses, quantityModule.metrics, ["region"], quantityModule.percentageMetric)], ["DM", quantityRollup(quantityResponses, quantityModule.metrics, ["region", "dm"], quantityModule.percentageMetric)]].flatMap(([kind, groups]) => groups.map((group) => [kind === "Región" ? group.labels[0] : `${group.labels[0]} · ${state.data.dms?.find((item) => item.dm === group.labels[1])?.shortName || group.labels[1]}`, group.stores, ...quantityModule.metrics.map((metric) => group.totals[metric.key]), group.totals.total, group.totals.percentage == null ? "" : {value: group.totals.percentage / 100, style: 3}]))],
        widths: [42, 12, ...quantityModule.metrics.map(() => 14), 16, 14], merges: [`A1:${spreadsheetColumn(quantityModule.metrics.length + 4)}1`, `A2:${spreadsheetColumn(quantityModule.metrics.length + 4)}2`], headerRows: [4], percentColumns: [quantityModule.metrics.length + 4], countColumns: [2, ...quantityModule.metrics.map((_, index) => index + 3), quantityModule.metrics.length + 3], freezeRow: 4, tabColor: "FF006241",
      }] : []),
    ],
  };
}

async function exportExcel() {
  if (!await beginExport("Excel")) return;
  try {
    await loadExportEngine("xlsx");
    if (!window.OPSXlsx) throw new Error("El motor XLSX no está disponible.");
    const context = exportContext("xlsx");
    const result = window.OPSXlsx.downloadWorkbook(buildExcelSpec(), context.filename);
    finishExport(context.filename, result.url);
  } catch (error) {
    failExport(error);
  }
}

function initNavigation() {
  const links = [...document.querySelectorAll(".main-nav a")];
  const navigation = document.querySelector(".main-nav");
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const setCurrent = (id) => links.forEach((link) => {
    const selected = link.getAttribute("href") === `#${id}`;
    link.setAttribute("aria-current", selected ? "page" : "false");
    if (selected && navigation.scrollWidth > navigation.clientWidth) {
      link.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  });
  links.forEach((link) => link.addEventListener("click", () => {
    const id = link.getAttribute("href").slice(1);
    setCurrent(id);
    if (id === "evidencias") $("#evidence-details").open = true;
  }));
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setCurrent(visible.target.id);
  }, { rootMargin: "-20% 0px -65%", threshold: [0.05, 0.25, 0.5] });
  sections.forEach((section) => observer.observe(section));
}

let aboutOpener = null;
let aboutPreviousOverflow = "";

function openAboutDialog(event) {
  const dialog = $("#about-dialog");
  if (dialog.open || state.exporting || !$("#export-modal").hidden) return;
  aboutOpener = event.currentTarget;
  aboutPreviousOverflow = document.body.style.overflow;
  dialog.showModal();
  dialog.scrollTop = 0;
  document.body.style.overflow = "hidden";
}

function closeAboutDialog() {
  const dialog = $("#about-dialog");
  if (dialog.open) dialog.close();
}

function bindEvents() {
  document.querySelectorAll("[data-open-about]").forEach((button) => button.addEventListener("click", openAboutDialog));
  $("#about-close").addEventListener("click", closeAboutDialog);
  $("#about-dialog").addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const controls = [...dialog.querySelectorAll("button:not([disabled]), a[href], summary")]
      .filter((control) => control.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  $("#about-dialog").addEventListener("close", () => {
    document.body.style.overflow = aboutPreviousOverflow;
    aboutOpener?.focus({ preventScroll: true });
    aboutOpener = null;
  });
  $("#about-dialog").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeAboutDialog();
  });
  $("#about-evidence-link").addEventListener("click", () => {
    aboutOpener = $("#evidence-details > summary");
    $("#evidence-details").open = true;
    closeAboutDialog();
  });
  $("#quantity-mode").addEventListener("click", (event) => {
    const mode = event.target.closest("button[data-fhw-mode]")?.dataset.fhwMode;
    if (!isFhwModule() || state.exporting || !["total", "average"].includes(mode)) return;
    state.fhwMode = mode;
    renderQuantityModule();
    syncFilterUrl();
  });
  $("#filter-region").addEventListener("change", (event) => { state.filters.region = event.target.value; state.filters.dm = ""; state.filters.store = ""; state.showAllEvidence = false; populateFilters(); renderAll(); });
  $("#filter-dm").addEventListener("change", (event) => { state.filters.dm = event.target.value; state.filters.store = ""; state.showAllEvidence = false; populateFilters(); renderAll(); });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; state.showAllEvidence = false; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => {
    state.filters.activity = event.target.value;
    state.filters.quantity = "";
    state.showAllEvidence = false;
    populateFilters();
    renderAll();
    const detailTarget = activeQuantityModule() ? $("#inventario-jarras") : activeSurveyModule() ? $("#detalle-actividad") : null;
    if (detailTarget && !detailTarget.hidden) requestAnimationFrame(() => detailTarget.scrollIntoView({ behavior: "smooth", block: "start" }));
  });
  $("#filter-quantity").addEventListener("change", (event) => {
    state.filters.quantity = event.target.value;
    state.showAllEvidence = false;
    renderAll();
  });
  $("#clear-filters").addEventListener("click", clearDashboardFilters);
  $("#evidence-toggle").addEventListener("click", () => { state.showAllEvidence = !state.showAllEvidence; renderEvidence(); });
  $("#evidence-filter-region").addEventListener("change", (event) => {
    state.evidenceFilters.region = event.target.value; state.evidenceFilters.dm = ""; state.evidenceFilters.store = ""; state.showAllEvidence = false;
    populateEvidenceFilters(); renderEvidence();
  });
  $("#evidence-filter-dm").addEventListener("change", (event) => {
    state.evidenceFilters.dm = event.target.value; state.evidenceFilters.store = ""; state.showAllEvidence = false;
    populateEvidenceFilters(); renderEvidence();
  });
  $("#evidence-filter-activity").addEventListener("change", (event) => { state.evidenceFilters.activity = event.target.value; state.showAllEvidence = false; renderEvidence(); });
  $("#evidence-filter-store").addEventListener("change", (event) => { state.evidenceFilters.store = event.target.value; state.showAllEvidence = false; renderEvidence(); });
  $("#export-image").addEventListener("click", exportImage);
  $("#export-pdf").addEventListener("click", exportPdf);
  $("#export-excel").addEventListener("click", exportExcel);
  $("#export-modal-accept").addEventListener("click", acceptExportConfirmation);
  $("#export-modal-cancel").addEventListener("click", cancelExportConfirmation);
  $("#export-modal-close").addEventListener("click", closeExportModal);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if ($("#about-dialog").open) { event.preventDefault(); closeAboutDialog(); return; }
    if ($("#export-menu").open) { $("#export-menu").open = false; $("#export-menu > summary").focus(); return; }
    if (!$("#export-modal").hidden && !state.exporting) closeExportModal();
    else if (Object.values(state.filters).some(Boolean)) { clearDashboardFilters(); $("#filter-region").focus(); }
  });
  document.addEventListener("click", (event) => {
    if (!$("#export-menu").contains(event.target) || event.target.closest("#export-menu .export-actions button")) $("#export-menu").open = false;
    const removeFilter = event.target.closest("[data-remove-filter]");
    if (removeFilter) {
      const key = removeFilter.dataset.removeFilter;
      state.filters[key] = "";
      if (key === "region") { state.filters.dm = ""; state.filters.store = ""; }
      if (key === "dm") state.filters.store = "";
      if (key === "activity") state.filters.quantity = "";
      state.showAllEvidence = false; populateFilters(); renderAll(); $("#filter-" + key)?.focus({ preventScroll: true });
      return;
    }
    const regionButton = event.target.closest("[data-region-focus]");
    if (regionButton) {
      const value = regionButton.dataset.regionFocus;
      state.filters.region = state.filters.region === value ? "" : value;
      state.filters.dm = ""; state.filters.store = ""; state.showAllEvidence = false;
      populateFilters(); renderAll(); $("#resumen")?.scrollIntoView({ behavior: "smooth" }); focusDynamicCard("data-region-focus", value);
      return;
    }
    const button = event.target.closest("[data-dm-focus]");
    if (!button) return;
    const value = button.dataset.dmFocus;
    state.filters.dm = state.filters.dm === value ? "" : value;
    state.filters.store = ""; state.showAllEvidence = false; populateFilters(); renderAll(); $("#resumen")?.scrollIntoView({ behavior: "smooth" }); focusDynamicCard("data-dm-focus", value);
  });
  $("#scope-reset").addEventListener("click", () => { clearDashboardFilters(); $("#filter-region").focus(); });
  $("#refresh-button").addEventListener("click", refreshApplicationData);
  $("#back-to-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", () => { $("#back-to-top").hidden = window.scrollY < 520; }, { passive: true });
  window.addEventListener("online", updateConnection); window.addEventListener("offline", updateConnection);
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; $("#install-button").hidden = false; });
  $("#install-button").addEventListener("click", async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $("#install-button").hidden = true; });
  initNavigation();
}

function updateConnection() {
  const offline = !navigator.onLine; $("#offline-banner").hidden = !offline;
  $("#connection-status").innerHTML = `<i></i>${offline ? "Sin conexión" : "Actualizado"}`;
}

const BUILD_STORAGE_KEY = "sistema-evidencias-build-version";

async function enforceBuildVersion(data) {
  const version = String(data?.buildVersion || "");
  if (!version) throw new Error("La publicación no incluye versión de actualización.");
  let previous = "";
  try {
    previous = localStorage.getItem(BUILD_STORAGE_KEY) || "";
    localStorage.setItem(BUILD_STORAGE_KEY, version);
  } catch (_error) {
    return false;
  }
  if (!previous || previous === version || sessionStorage.getItem(BUILD_STORAGE_KEY) === version) return false;
  sessionStorage.setItem(BUILD_STORAGE_KEY, version);
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("sistema-evidencias-ops-")).map((key) => caches.delete(key)));
  }
  const registration = await navigator.serviceWorker?.getRegistration?.();
  registration?.active?.postMessage({ type: "CLEAR_ALL_CACHES" });
  await registration?.update();
  const url = new URL(window.location.href);
  url.searchParams.set("build", version);
  window.location.replace(url.toString());
  return true;
}

async function loadData(announce = false) {
  $("#refresh-button").disabled = true;
  try {
    const response = await fetch("./data/dashboard.json", {
      cache: "no-store", headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) throw new Error(`No fue posible cargar los datos (${response.status}).`);
    const latestData = await response.json();
    if (await enforceBuildVersion(latestData)) return;
    state.data = latestData;
    readFilterUrl();
    $("#last-updated").textContent = cutStamp();
    const director = state.data.organization?.nationalDirector || state.data.report?.regionalDirector;
    if (director) {
      $("#director-name").textContent = director.name;
      $("#director-role").textContent = director.role;
      $("#director-photo").src = `./${director.heroPhoto || director.photo}`;
      $("#director-photo").alt = `${director.name}, ${director.role}`;
    }
    populateFilters(); populateEvidenceFilters(); renderAll(); $("#main").setAttribute("aria-busy", "false"); $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Datos renovados";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta python scripts/build_dashboard.py.`; $("#error-banner").hidden = false;
  } finally { $("#main").setAttribute("aria-busy", "false"); $("#refresh-button").disabled = false; }
}

async function refreshApplicationData() {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    registration?.active?.postMessage({ type: "CLEAR_OLD_CACHES" });
  }
  await loadData(true);
}

async function registerLatestServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing || !navigator.serviceWorker.controller) return;
    refreshing = true;
    window.location.reload();
  });
  const registration = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
  await registration.update();
  registration.waiting?.postMessage({ type: "SKIP_WAITING" });
}

bindEvents(); updateConnection(); loadData();
window.addEventListener("load", () => registerLatestServiceWorker().catch(() => {}));
