const state = {
  data: null,
  filters: { dm: "", store: "", activity: "" },
  evidenceFilters: { dm: "", store: "", activity: "" },
  showAllEvidence: false,
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

function selectedActivities() {
  return state.filters.activity ? [state.filters.activity] : state.data.activities.map((item) => item.name);
}

function filteredStores() {
  return state.data.stores.filter((store) =>
    (!state.filters.dm || store.dm === state.filters.dm) &&
    (!state.filters.store || store.ceco === state.filters.store));
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
  return state.filters.dm || state.data.region;
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
    motto: "JUNTÉMONOS MÁS", credits: "Diseñado por Jorge Alcantar Aguiar & Enrique César Flores",
  };
}

function exportProfile() {
  const director = reportMeta().regionalDirector || {
    name: "Jorge Alcantar", role: "Director Regional", photo: "assets/director/jorge-alcantar.webp",
  };
  const dmName = state.filters.dm || (state.filters.store ? filteredStores()[0]?.dm : "");
  const dm = dmName ? state.data.dms.find((item) => item.dm === dmName) : null;
  return dm ? { name: dm.shortName || dm.dm, role: "DM", photo: dm.photo } : director;
}

function renderSummary() {
  const item = metrics();
  const signal = semaphore(item.compliance);
  $("#score-value").textContent = percent(item.compliance);
  $("#score-ring").dataset.tone = signal.tone;
  $("#score-ring").style.setProperty("--score", `${Math.min(item.compliance, 100) * 3.6}deg`);
  $("#score-title").textContent = currentScope();
  $("#score-message").textContent = !item.expected
    ? "El alcance seleccionado no aplica para esta actividad."
    : item.pending
      ? `${number(item.completed)} de ${number(item.expected)} actividades aplicables realizadas · ${signal.label}.`
      : "El alcance seleccionado está completo.";
  $("#kpi-grid").innerHTML = [
    [number(item.dms), "DM"],
    [number(item.activities), "Actividades"],
    [number(item.stores), "Tiendas"],
    [number(item.expected), "Aplican"],
    [number(item.notApplicable), "No aplica"],
    [number(item.pending), "Pendientes"],
  ].map(([value, label]) => `<article class="kpi"><strong>${value}</strong><span>${label}</span></article>`).join("");
}

function renderActivities() {
  const stores = filteredStores();
  const activities = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#activity-progress").innerHTML = activities.length ? activities.map((item) => {
    const progress = stores.map((store) => completionFor(store, [item.name]));
    const completed = progress.reduce((sum, row) => sum + row.completed, 0);
    const expected = progress.reduce((sum, row) => sum + row.expected, 0);
    const notApplicable = progress.reduce((sum, row) => sum + row.notApplicable, 0);
    const value = expected ? completed / expected * 100 : 0;
    const signal = semaphore(value);
    return `<article class="progress-item ${signal.tone}">
      <span class="traffic-light" aria-hidden="true"></span>
      <div class="progress-title"><strong>${esc(item.name)}</strong><span>${esc(item.description || "Actividad vigente")}</span></div>
      <div class="bar" aria-label="${percent(value)} de avance"><span style="--progress:${Math.min(value, 100)}%"></span></div>
      <div class="progress-number"><strong>${percent(value)}</strong><small>${completed}/${expected} aplican${notApplicable ? ` · ${notApplicable} N/A` : ""}</small></div>
      <span class="status ${signal.tone}">${signal.label}</span>
    </article>`;
  }).join("") : '<div class="empty-state">No hay actividades para el filtro seleccionado.</div>';
}

function commitmentSignal(item) {
  if (!item.endDate) return { label: "Sin fecha definida", tone: "neutral" };
  const end = new Date(`${item.endDate}T23:59:59`);
  const days = Math.ceil((end - new Date()) / 86400000);
  if (days < 0) return { label: "Vencida", tone: "red" };
  if (days <= 7) return { label: "Próxima", tone: "amber" };
  return { label: "Programada", tone: "green" };
}

function renderCommitments() {
  const activities = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#commitment-dates").innerHTML = activities.map((item) => {
    const signal = commitmentSignal(item);
    return `<div class="commitment-row"><span class="date-dot ${signal.tone}"></span><strong>${esc(item.name)}</strong><time>${esc(item.commitmentDateDisplay || "Sin fecha compromiso")}</time><small class="status ${signal.tone}">${signal.label}</small></div>`;
  }).join("") || '<div class="empty-state">Sin fechas compromiso.</div>';
}

function filteredEvidence() {
  return state.data.submissions.filter((item) =>
    item.valid && item.evidenceAvailable &&
    (!state.evidenceFilters.dm || item.dm === state.evidenceFilters.dm) &&
    (!state.evidenceFilters.store || item.ceco === state.evidenceFilters.store) &&
    (!state.evidenceFilters.activity || item.activity === state.evidenceFilters.activity));
}

function renderEvidence() {
  const rows = filteredEvidence();
  const visible = state.showAllEvidence ? rows : rows.slice(0, 6);
  $("#evidence-count").textContent = `${rows.length} ${rows.length === 1 ? "archivo" : "archivos"}`;
  $("#evidence-grid").innerHTML = visible.length ? visible.map((item) => `<article class="evidence-row">
    <span class="evidence-cell" data-label="Actividad"><strong>${esc(item.activity)}</strong></span>
    <span class="evidence-cell evidence-store" data-label="Tienda"><strong>${esc(item.store)}</strong><small>CeCo ${esc(item.ceco)}</small></span>
    ${item.evidenceLinkPublished && item.evidenceUrl
      ? `<a class="evidence-link" data-label="Link del archivo" href="${esc(item.evidenceUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" title="${esc(item.evidenceFileName)}" aria-label="Abrir ${esc(item.evidenceFileName)}">${esc(item.evidenceLinkLabel)}</a>`
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
    return `<button type="button" class="dm-card ${signal.tone} ${state.filters.dm === dm.dm ? "selected" : ""}" data-dm-focus="${esc(dm.dm)}">
      <span class="rank-icon" aria-label="Posición ${index + 1}">${rank}</span>
      <img src="./${esc(dm.photo)}" alt="Fotografía de ${esc(dm.shortName)}" loading="lazy">
      <span class="dm-copy"><strong>${esc(dm.shortName)}</strong><em>${dm.dmStores.length} tiendas · ${dm.completed}/${dm.expected} aplican${dm.notApplicable ? ` · ${dm.notApplicable} N/A` : ""}</em></span>
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
      <td><span class="table-rank">${index + 1}</span></td><td><strong>${esc(store.ceco)}</strong></td><td>${esc(store.store)}</td><td>${esc(store.dm)}</td>
      <td><strong>${store.completed}/${store.expected}</strong></td>
      <td>${store.notApplicable ? `<span class="status neutral">${store.notApplicable}</span>` : "—"}</td>
      <td><div class="table-progress ${signal.tone}"><span><i style="--progress:${Math.min(store.compliance, 100)}%"></i></span><b>${percent(store.compliance)}</b></div></td>
      <td><span class="status ${signal.tone}">${signal.label}</span></td>
    </tr>`;
  }).join("") : '<tr><td colspan="8"><div class="empty-state">Sin tiendas para mostrar.</div></td></tr>';
}

function syncFilterUrl() {
  const url = new URL(location.href);
  [["dm", state.filters.dm], ["store", state.filters.store], ["activity", state.filters.activity]].forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  });
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function readFilterUrl() {
  const params = new URLSearchParams(location.search);
  state.filters = { dm: params.get("dm") || "", store: params.get("store") || "", activity: params.get("activity") || "" };
}

function renderActiveScope() {
  const item = metrics();
  $("#active-scope").innerHTML = `<strong>Vista:</strong> ${esc(reportScope())} <span>·</span> ${esc(state.filters.activity || "Todas las actividades")} <span>·</span> ${number(item.completed)}/${number(item.expected)} aplican${item.notApplicable ? ` <span>·</span> ${number(item.notApplicable)} no aplica` : ""}`;
}

function renderAll() {
  renderSummary(); renderActivities(); renderCommitments(); renderEvidence(); renderTeam(); renderStores(); renderActiveScope(); syncFilterUrl();
}

function populateFilters() {
  const dms = [...new Set(state.data.stores.map((store) => store.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#filter-dm").innerHTML = '<option value="">Todos los DM</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  if (!dms.includes(state.filters.dm)) state.filters.dm = "";
  $("#filter-dm").value = state.filters.dm;
  const stores = state.data.stores.filter((store) => !state.filters.dm || store.dm === state.filters.dm);
  $("#filter-store").innerHTML = '<option value="">Todas las tiendas</option>' + stores.map((store) => `<option value="${esc(store.ceco)}">${esc(store.ceco)} · ${esc(store.store)}</option>`).join("");
  if (!stores.some((store) => store.ceco === state.filters.store)) state.filters.store = "";
  $("#filter-store").value = state.filters.store;
  $("#filter-activity").innerHTML = '<option value="">Todas las actividades</option>' + state.data.activities.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  if (!state.data.activities.some((item) => item.name === state.filters.activity)) state.filters.activity = "";
  $("#filter-activity").value = state.filters.activity;
}

function populateEvidenceFilters() {
  const source = state.data.submissions.filter((item) => item.valid && item.evidenceAvailable);
  const dms = [...new Set(source.map((item) => item.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#evidence-filter-dm").innerHTML = '<option value="">Todos los DM</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  if (!dms.includes(state.evidenceFilters.dm)) state.evidenceFilters.dm = "";
  $("#evidence-filter-dm").value = state.evidenceFilters.dm;

  const activities = [...new Set(source.map((item) => item.activity))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#evidence-filter-activity").innerHTML = '<option value="">Todas las actividades</option>' + activities.map((activity) => `<option value="${esc(activity)}">${esc(activity)}</option>`).join("");
  if (!activities.includes(state.evidenceFilters.activity)) state.evidenceFilters.activity = "";
  $("#evidence-filter-activity").value = state.evidenceFilters.activity;

  const stores = source.filter((item) => !state.evidenceFilters.dm || item.dm === state.evidenceFilters.dm)
    .map((item) => ({ ceco: item.ceco, store: item.store }))
    .filter((item, index, rows) => rows.findIndex((row) => row.ceco === item.ceco) === index)
    .sort((a, b) => a.store.localeCompare(b.store, "es-MX"));
  $("#evidence-filter-store").innerHTML = '<option value="">Todas las tiendas</option>' + stores.map((item) => `<option value="${esc(item.ceco)}">${esc(item.ceco)} · ${esc(item.store)}</option>`).join("");
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
  return state.filters.store ? `Tienda · ${currentScope()}` : state.filters.dm ? `DM · ${state.filters.dm}` : `Región · ${state.data.region}`;
}

function exportContext(format) {
  const item = metrics();
  const activity = state.filters.activity || "Todas las actividades";
  const type = state.filters.store ? "Tienda" : state.filters.dm ? "DM" : "Regional";
  const name = state.filters.store ? currentScope() : state.filters.dm || state.data.region;
  const filename = `Sistema_Evidencia_OPS_${type}_${fileSafe(name)}_${fileSafe(activity)}_Corte_${cutDate().replaceAll("/", "-")}.${format}`;
  return {
    item, activity, type, name, filename,
    summary: [
      ["Alcance", `${type} · ${name}`],
      ["Actividad", activity],
      ["Avance", `${number(item.completed)} realizadas / ${number(item.expected)} aplican / ${percent(item.compliance)}`],
      ["No aplica", number(item.notApplicable)],
    ],
  };
}

async function exportPdf() {
  if (!await beginExport("PDF")) return;
  try {
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

async function renderPdfPages() {
  const rows = exportRows();
  const meta = reportMeta();
  const current = metrics();
  const mode = exportMode();
  const director = meta.regionalDirector || { name: "Jorge Alcantar", role: "Director Regional", photo: "assets/director/jorge-alcantar.webp" };
  const profile = exportProfile();
  const sources = ["./assets/icons/icon-64.webp", `./${profile.photo}`, ...rows.map((item) => item.photo ? `./${item.photo}` : "")];
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
    if (logo) context.drawImage(logo, 55, 66, 76, 76);
    context.textAlign = "center";
    context.fillStyle = "#a9dbc5"; context.font = "800 18px Segoe UI, sans-serif"; context.fillText(meta.motto, 800, 45);
    context.fillStyle = "#ffffff"; context.font = "800 38px Segoe UI, sans-serif"; context.fillText(meta.title, 800, 91);
    context.font = "650 20px Segoe UI, sans-serif"; context.fillText(fitText(context, `${reportScope()} · Corte ${cutStamp()}`, 850), 800, 132);
    context.textAlign = "left";

    if (profilePhoto) {
      context.save(); context.beginPath(); context.arc(1248, 92, 48, 0, Math.PI * 2); context.clip(); drawCover(context, profilePhoto, 1200, 44, 96, 96); context.restore();
      context.fillStyle = "#ffffff"; context.font = "750 16px Segoe UI, sans-serif"; context.fillText(profile.name, 1184, 162);
      context.fillStyle = "#b9e1d0"; context.font = "650 13px Segoe UI, sans-serif"; context.fillText(profile.role, 1184, 181);
    }
    const cards = [["REALIZADAS / APLICAN", `${number(current.completed)} / ${number(current.expected)}`], ["NO APLICA", number(current.notApplicable)], ["% AVANCE", percent(current.compliance)]];
    cards.forEach(([label, value], cardIndex) => {
      const x = 55 + cardIndex * 503;
      context.fillStyle = cardIndex === 2 ? "#e0f2e9" : "#ffffff"; context.fillRect(x, 225, 483, 82);
      context.textAlign = "center";
      context.fillStyle = "#5d7067"; context.font = "750 14px Segoe UI, sans-serif"; context.fillText(label, x + 241, 252);
      context.fillStyle = "#1e3932"; context.font = "850 28px Segoe UI, sans-serif"; context.fillText(value, x + 241, 287);
      context.textAlign = "left";
    });

    const tableTop = 330;
    context.fillStyle = "#1e3932"; context.fillRect(55, tableTop, 1490, 55);
    context.fillStyle = "#ffffff"; context.font = "750 14px Segoe UI, sans-serif";
    const headers = [["RANKING", 75], [mode === "dms" ? "DM" : "TIENDA / CECO", 185], ["REALIZADAS / APLICAN", 960], ["N/A", 1260], ["% AVANCE", 1390]];
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
      context.fillText(number(item.notApplicable), 1280, y + rowHeight / 2 + 7);
      context.fillStyle = signal.tone === "green" ? "#116444" : signal.tone === "amber" ? "#80520c" : "#922f24"; context.font = "850 20px Segoe UI, sans-serif";
      context.fillText(percent(item.value), 1410, y + rowHeight / 2 + 7);
    });

    context.fillStyle = "#1e3932"; context.fillRect(55, 1055, 1490, 50);
    context.fillStyle = "#ffffff"; context.font = "750 15px Segoe UI, sans-serif"; context.fillText(meta.motto, 75, 1086);
    context.textAlign = "right"; context.fillStyle = "#cce0d7"; context.font = "500 13px Segoe UI, sans-serif"; context.fillText(meta.credits, 1525, 1086); context.textAlign = "left";
    return canvas;
  });
}

async function exportImage() {
  if (!await beginExport("imagen")) return;
  try {
    const rows = exportRows();
    const meta = reportMeta();
    const current = metrics();
    const mode = exportMode();
    const director = meta.regionalDirector || { name: "Jorge Alcantar", role: "Director Regional", photo: "assets/director/jorge-alcantar.webp" };
    const profile = exportProfile();
    const width = 1600; const headerHeight = 230; const tableHeader = 72; const rowHeight = mode === "dms" ? 148 : 108; const footerHeight = 110;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = headerHeight + tableHeader + Math.max(rows.length, 1) * rowHeight + footerHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f6f8f7"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#006241"; context.fillRect(0, 0, width, headerHeight);
    const assets = await Promise.all([loadImage("./assets/icons/icon-64.webp"), loadImage(`./${profile.photo}`), ...rows.map((item) => item.photo ? loadImage(`./${item.photo}`) : Promise.resolve(null))]);
    const [logo, profilePhoto, ...photos] = assets;
    if (logo) context.drawImage(logo, 72, 70, 78, 78);
    context.textAlign = "center";
    context.fillStyle = "#b9e1d0"; context.font = "700 20px Segoe UI, sans-serif"; context.fillText(meta.motto, 800, 55);
    context.fillStyle = "#ffffff"; context.font = "700 42px Segoe UI, sans-serif"; context.fillText(meta.title, 800, 108);
    context.font = "600 22px Segoe UI, sans-serif"; context.fillText(`${reportScope()} · Corte ${cutStamp()}`, 800, 150);
    context.fillStyle = "#b9e1d0"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText(`REALIZADAS / APLICAN  ${number(current.completed)} / ${number(current.expected)}   |   NO APLICA  ${number(current.notApplicable)}   |   % AVANCE  ${percent(current.compliance)}`, 800, 188);
    context.textAlign = "left";
    if (profilePhoto) {
      context.save(); context.beginPath(); context.arc(1260, 105, 43, 0, Math.PI * 2); context.clip(); drawCover(context, profilePhoto, 1217, 62, 86, 86); context.restore();
      context.fillStyle = "#ffffff"; context.font = "700 15px Segoe UI, sans-serif"; context.fillText(profile.name, 1190, 169);
      context.fillStyle = "#b9e1d0"; context.font = "600 13px Segoe UI, sans-serif"; context.fillText(profile.role, 1190, 190);
    }
    context.textAlign = "left";
    const top = headerHeight; context.fillStyle = "#e5efea"; context.fillRect(0, top, width, tableHeader);
    context.fillStyle = "#42564d"; context.font = "700 17px Segoe UI, sans-serif";
    context.fillText("RANKING", 70, top + 45); context.fillText(mode === "dms" ? "DM" : "TIENDA / CECO", 190, top + 45); context.fillText("REALIZADAS / APLICAN", 960, top + 45); context.fillText("N/A", 1270, top + 45); context.fillText("% AVANCE", 1400, top + 45);
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
      context.fillText(number(item.notApplicable), 1290, centerY + 10);
      context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#a86b0a" : "#a2352a"; context.font = "800 31px Segoe UI, sans-serif"; context.fillText(percent(item.value), 1410, centerY + 10);
    });
    const footerY = canvas.height - footerHeight; context.fillStyle = "#1e3932"; context.fillRect(0, footerY, width, footerHeight);
    context.fillStyle = "#ffffff"; context.font = "800 23px Segoe UI, sans-serif"; context.fillText(meta.motto, 72, footerY + 48);
    context.fillStyle = "#cce0d7"; context.font = "400 18px Segoe UI, sans-serif"; context.fillText(meta.credits, 72, footerY + 79);
    context.textAlign = "right"; context.fillStyle = "#ffffff"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText(`${director.role} · ${director.name}`, 1525, footerY + 64); context.textAlign = "left";
    const exportInfo = exportContext("png");
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No fue posible crear la imagen.")), "image/png"));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = exportInfo.filename; document.body.appendChild(link); link.click(); link.remove();
    finishExport(exportInfo.filename, url);
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

function buildExcelSpec() {
  const item = metrics();
  const rows = exportRows();
  const mode = exportMode();
  const scope = reportScope();
  const stores = filteredStores();
  const activities = state.data.activities.filter((activity) => !state.filters.activity || activity.name === state.filters.activity);
  const detailHeaders = mode === "dms"
    ? ["Ranking", "DM", "Realizadas", "Aplican", "No aplica", "% Avance", "Estado"]
    : ["CeCo", "Tienda", ...activities.map((activity) => activity.name), "Realizadas", "Aplican", "No aplica", "% Avance"];
  const activityStartColumn = 3;
  const activityEndColumn = activityStartColumn + activities.length - 1;
  const completedColumn = activityEndColumn + 1;
  const totalColumn = completedColumn + 1;
  const notApplicableColumn = totalColumn + 1;
  const advanceColumn = notApplicableColumn + 1;
  const storesByCeco = new Map(stores.map((store) => [store.ceco, store]));
  const matrixStores = rows.map((row) => storesByCeco.get(row.ceco)).filter(Boolean);
  const detailRows = mode === "dms" ? rows.map((row) => [
    row.rank, row.label, row.completed, row.expected, row.notApplicable, row.value / 100, semaphore(row.value).label,
  ]) : matrixStores.map((store, index) => {
    const rowNumber = index + 5;
    const result = completionFor(store, activities.map((activity) => activity.name));
    const activityValues = activities.map((activity) => store.applicableActivities?.[activity.name] === false
      ? { value: "", style: 0 }
      : { value: store.activities[activity.name] ? 1 : 0, style: store.activities[activity.name] ? 7 : 8 });
    const activityRange = `${spreadsheetColumn(activityStartColumn)}${rowNumber}:${spreadsheetColumn(activityEndColumn)}${rowNumber}`;
    return [
      store.ceco,
      store.store,
      ...activityValues,
      { formula: `SUM(${activityRange})`, cached: result.completed, style: 6 },
      { formula: `COUNT(${activityRange})`, cached: result.expected, style: 6 },
      { formula: `COUNTBLANK(${activityRange})`, cached: result.notApplicable, style: 6 },
      { formula: `IFERROR(${spreadsheetColumn(completedColumn)}${rowNumber}/${spreadsheetColumn(totalColumn)}${rowNumber},0)`, cached: result.compliance / 100, style: 3 },
    ];
  });
  const activityRows = activities.map((activity, index) => {
    const progress = stores.map((store) => completionFor(store, [activity.name]));
    const completed = progress.reduce((sum, row) => sum + row.completed, 0);
    const expected = progress.reduce((sum, row) => sum + row.expected, 0);
    const notApplicable = progress.reduce((sum, row) => sum + row.notApplicable, 0);
    const value = expected ? completed / expected : 0;
    return [index + 1, activity.name, completed, expected, notApplicable, value, activity.commitmentDateDisplay || "Sin fecha"];
  });
  return {
    title: `Sistema de Evidencias OPS · ${scope}`,
    sheets: [
      {
        name: "Resumen",
        rows: [
          ["Sistema de Evidencias OPS", "", ""],
          [`${scope} · Corte ${cutStamp()}`, "", ""],
          [],
          ["Indicador", "Valor", "Validación"],
          ["Realizadas", item.completed, "Cumplimientos del filtro actual"],
          ["Aplican", item.expected, `${item.stores} tiendas · ${item.activities} actividades`],
          ["No aplica", item.notApplicable, "Excluidas únicamente por la regla de Hornos"],
          ["% Avance", { value: item.compliance / 100, style: 3 }, `${item.completed} realizadas / ${item.expected} aplican`],
        ],
        widths: [24, 18, 46], merges: ["A1:C1", "A2:C2"], headerRows: [4], countColumns: [2], freezeRow: 4, autoFilter: "A4:C8",
      },
      {
        name: mode === "dms" ? "Ranking DM" : "Tiendas",
        rows: [[mode === "dms" ? "Ranking DM" : "Detalle de actividades por tienda", ...Array(detailHeaders.length - 1).fill("")], [`${scope} · Corte ${cutStamp()}`, ...Array(detailHeaders.length - 1).fill("")], [mode === "dms" ? "" : "1 = Realizada · 0 = Pendiente · vacío = No aplica", ...Array(detailHeaders.length - 1).fill("")], detailHeaders, ...detailRows],
        widths: mode === "dms" ? [10, 34, 14, 12, 12, 14, 16] : [13, 28, ...activities.map((activity) => Math.max(16, Math.min(36, activity.name.length + 3))), 14, 12, 12, 14],
        merges: mode === "dms"
          ? ["A1:G1", "A2:G2"]
          : [`A1:${spreadsheetColumn(advanceColumn)}1`, `A2:${spreadsheetColumn(advanceColumn)}2`, `A3:${spreadsheetColumn(advanceColumn)}3`],
        headerRows: [4],
        percentColumns: [mode === "dms" ? 6 : advanceColumn],
        countColumns: mode === "dms" ? [1, 3, 4, 5] : [...activities.map((_, index) => activityStartColumn + index), completedColumn, totalColumn, notApplicableColumn],
        freezeRow: 4,
        autoFilter: `A4:${spreadsheetColumn(mode === "dms" ? 7 : advanceColumn)}${4 + detailRows.length}`,
      },
      {
        name: "Actividades",
        rows: [["Avance por actividad", "", "", "", "", "", ""], [`${scope} · Corte ${cutStamp()}`, "", "", "", "", "", ""], [], ["Orden", "Actividad", "Realizadas", "Aplican", "No aplica", "% Avance", "Fecha compromiso"], ...activityRows],
        widths: [10, 42, 14, 12, 12, 14, 20], merges: ["A1:G1", "A2:G2"], headerRows: [4], percentColumns: [6], freezeRow: 4, autoFilter: `A4:G${4 + activityRows.length}`,
      },
    ],
  };
}

async function exportExcel() {
  if (!await beginExport("Excel")) return;
  try {
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
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const setCurrent = (id) => links.forEach((link) => link.setAttribute("aria-current", link.getAttribute("href") === `#${id}` ? "page" : "false"));
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

function bindEvents() {
  $("#filter-dm").addEventListener("change", (event) => { state.filters.dm = event.target.value; state.filters.store = ""; state.showAllEvidence = false; populateFilters(); renderAll(); });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; state.showAllEvidence = false; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => { state.filters.activity = event.target.value; state.showAllEvidence = false; renderAll(); });
  $("#clear-filters").addEventListener("click", () => { state.filters = { dm: "", store: "", activity: "" }; state.showAllEvidence = false; populateFilters(); renderAll(); });
  $("#evidence-toggle").addEventListener("click", () => { state.showAllEvidence = !state.showAllEvidence; renderEvidence(); });
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
  $("#toggle-dates").addEventListener("click", () => {
    const panel = $("#commitment-dates"); panel.hidden = !panel.hidden;
    $("#toggle-dates").setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dm-focus]");
    if (!button) return;
    state.filters.dm = state.filters.dm === button.dataset.dmFocus ? "" : button.dataset.dmFocus;
    state.filters.store = ""; state.showAllEvidence = false; populateFilters(); renderAll(); $("#resumen")?.scrollIntoView({ behavior: "smooth" });
  });
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

async function loadData(announce = false) {
  $("#refresh-button").disabled = true;
  try {
    const response = await fetch(`./data/dashboard.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`No fue posible cargar los datos (${response.status}).`);
    state.data = await response.json();
    readFilterUrl();
    $("#last-updated").textContent = cutStamp();
    const director = state.data.report?.regionalDirector;
    if (director) {
      $("#director-name").textContent = director.name;
      $("#director-role").textContent = director.role;
      $("#director-photo").src = `./${director.photo}`;
      $("#director-photo").alt = `${director.name}, ${director.role}`;
    }
    populateFilters(); populateEvidenceFilters(); renderAll(); $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Datos renovados";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta python scripts/build_dashboard.py.`; $("#error-banner").hidden = false;
  } finally { $("#refresh-button").disabled = false; }
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
