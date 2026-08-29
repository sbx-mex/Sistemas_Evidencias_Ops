const state = { data: null, filters: { dm: "", store: "", activity: "" }, installPrompt: null };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
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
  const completed = activities.reduce((sum, activity) => sum + (store.activities[activity] ? 1 : 0), 0);
  const expected = activities.length;
  return { completed, expected, pending: expected - completed, compliance: expected ? completed / expected * 100 : 0 };
}

function metrics() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const expected = stores.length * activities.length;
  const completed = stores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
  return {
    stores: stores.length,
    activities: activities.length,
    completed,
    expected,
    pending: expected - completed,
    compliance: expected ? completed / expected * 100 : 0,
    storesWithProgress: stores.filter((store) => completionFor(store, activities).completed > 0).length,
  };
}

function currentScope() {
  if (state.filters.store) return filteredStores()[0]?.store || "Tienda";
  return state.filters.dm || state.data.region;
}

function status(completed, expected) {
  if (expected && completed === expected) return ["Completo", "complete"];
  if (completed) return ["En avance", "progress"];
  return ["Por iniciar", "empty"];
}

function renderSummary() {
  const item = metrics();
  $("#score-value").textContent = percent(item.compliance);
  $("#score-ring").style.setProperty("--score", `${Math.min(item.compliance, 100) * 3.6}deg`);
  $("#score-title").textContent = currentScope();
  $("#score-message").textContent = item.pending
    ? `${number(item.pending)} pendientes. Empieza por las tiendas sin registro.`
    : "El alcance seleccionado está completo.";
  $("#kpi-grid").innerHTML = [
    [number(item.completed), "Cumplimientos"],
    [number(item.storesWithProgress), "Tiendas con avance"],
    [number(item.activities), "Actividades vigentes"],
  ].map(([value, label]) => `<article class="kpi"><strong>${value}</strong><span>${label}</span></article>`).join("");
}

function renderActivities() {
  const stores = filteredStores();
  const activities = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#activity-context").textContent = currentScope();
  $("#activity-progress").innerHTML = activities.length ? activities.map((item) => {
    const completed = stores.filter((store) => store.activities[item.name]).length;
    const value = stores.length ? completed / stores.length * 100 : 0;
    const dates = item.startDate || item.endDate
      ? `${item.startDate || "Abierta"} → ${item.endDate || "Sin cierre"}`
      : "Sin restricción de fecha";
    return `<div class="progress-item">
      <div class="progress-title"><strong>${esc(item.name)}</strong><small>${esc(item.priority)} · ${esc(dates)}</small></div>
      <div class="bar"><span style="--progress:${Math.min(value, 100)}%"></span></div>
      <div class="progress-number"><strong>${percent(value)}</strong><small>${completed}/${stores.length}</small></div>
    </div>`;
  }).join("") : '<div class="empty-state">No hay actividades vigentes.</div>';
}

function renderPriority() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .filter((store) => store.pending > 0)
    .sort((a, b) => a.compliance - b.compliance || a.store.localeCompare(b.store, "es-MX"))
    .slice(0, 6);
  $("#priority-stores").innerHTML = rows.length ? rows.map((store, index) => `
    <button type="button" class="priority-row" data-store-focus="${esc(store.ceco)}">
      <span>${index + 1}</span><div><strong>${esc(store.store)}</strong><small>${esc(store.ceco)} · ${esc(store.dm)}</small></div><b>${store.pending}</b>
    </button>`).join("") : '<div class="empty-state">Sin pendientes en la vista.</div>';
}

function renderTeam() {
  $("#dm-team").innerHTML = state.data.dms.map((dm) => {
    const selected = state.filters.dm === dm.dm;
    const dmStores = state.data.stores.filter((store) => store.dm === dm.dm);
    const activities = selectedActivities();
    const completed = dmStores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
    const expected = dmStores.length * activities.length;
    const value = expected ? completed / expected * 100 : 0;
    const [label, tone] = status(completed, expected);
    return `<button type="button" class="dm-card ${selected ? "selected" : ""}" data-dm-focus="${esc(dm.dm)}">
      <img src="./${esc(dm.photo)}" alt="Fotografía de ${esc(dm.shortName)}" loading="lazy">
      <span class="dm-copy"><small>Gerente de Distrito</small><strong>${esc(dm.shortName)}</strong><em>${dmStores.length} tiendas</em></span>
      <span class="dm-result"><strong>${percent(value)}</strong><small class="status ${tone}">${label}</small></span>
    </button>`;
  }).join("");
}

function renderStores() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .sort((a, b) => b.compliance - a.compliance || a.store.localeCompare(b.store, "es-MX"));
  const total = rows.reduce((sum, row) => sum + row.completed, 0);
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  $("#store-summary").textContent = `${rows.length} tiendas · ${total}/${expected} cumplimientos`;
  $("#store-table").innerHTML = rows.length ? rows.map((store) => {
    const [label, tone] = status(store.completed, store.expected);
    return `<tr><td><strong>${esc(store.ceco)}</strong></td><td>${esc(store.store)}</td><td>${esc(store.dm)}</td>
      <td><div class="table-progress"><span><i style="--progress:${Math.min(store.compliance, 100)}%"></i></span><b>${percent(store.compliance)}</b></div></td>
      <td>${store.pending}</td><td><span class="status ${tone}">${label}</span></td></tr>`;
  }).join("") : '<tr><td colspan="6"><div class="empty-state">Sin tiendas para mostrar.</div></td></tr>';
}

function renderQuality() {
  const quality = state.data.quality;
  const calendar = state.data.calendar || {};
  $("#quality-strip").innerHTML = [
    [quality.responsesRead, "Respuestas Forms"],
    [quality.unknownCeCos.length, "CeCo sin cruce"],
    [calendar.active || 0, "Actividades vigentes"],
    [calendar.scheduled || 0, "Programadas"],
  ].map(([value, label]) => `<span><strong>${number(value)}</strong>${label}</span>`).join("");
}

function bindDynamicActions() {
  $$('[data-dm-focus]').forEach((button) => button.addEventListener("click", () => {
    state.filters.dm = state.filters.dm === button.dataset.dmFocus ? "" : button.dataset.dmFocus;
    state.filters.store = "";
    populateFilters(); renderAll(); window.scrollTo({ top: 0, behavior: "smooth" });
  }, { once: true }));
  $$('[data-store-focus]').forEach((button) => button.addEventListener("click", () => {
    const store = state.data.stores.find((item) => item.ceco === button.dataset.storeFocus);
    if (!store) return;
    state.filters.dm = store.dm; state.filters.store = store.ceco;
    populateFilters(); renderAll(); window.scrollTo({ top: 0, behavior: "smooth" });
  }, { once: true }));
}

function renderAll() {
  renderSummary(); renderActivities(); renderPriority(); renderTeam(); renderStores(); renderQuality(); bindDynamicActions();
}

function populateFilters() {
  const dms = [...new Set(state.data.stores.map((store) => store.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#filter-dm").innerHTML = '<option value="">Todos</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  $("#filter-dm").value = state.filters.dm;
  const stores = state.data.stores.filter((store) => !state.filters.dm || store.dm === state.filters.dm);
  $("#filter-store").innerHTML = '<option value="">Todas</option>' + stores.map((store) => `<option value="${esc(store.ceco)}">${esc(store.ceco)} · ${esc(store.store)}</option>`).join("");
  if (!stores.some((store) => store.ceco === state.filters.store)) state.filters.store = "";
  $("#filter-store").value = state.filters.store;
  $("#filter-activity").innerHTML = '<option value="">Todas</option>' + state.data.activities.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  $("#filter-activity").value = state.filters.activity;
}

function exportCsv() {
  const rows = filteredStores().map((store) => { const item = completionFor(store); return [store.ceco, store.store, store.dm, item.completed, item.expected, percent(item.compliance)]; });
  const csv = [["CeCo", "Tienda", "DM", "Realizadas", "Esperadas", "Cumplimiento"], ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = `Evidencias_OPS_${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function bindEvents() {
  $("#filter-dm").addEventListener("change", (event) => { state.filters.dm = event.target.value; state.filters.store = ""; populateFilters(); renderAll(); });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => { state.filters.activity = event.target.value; renderAll(); });
  $("#clear-filters").addEventListener("click", () => { state.filters = { dm: "", store: "", activity: "" }; populateFilters(); renderAll(); });
  $("#export-csv").addEventListener("click", exportCsv);
  $("#refresh-button").addEventListener("click", () => loadData(true));
  window.addEventListener("online", updateConnection); window.addEventListener("offline", updateConnection);
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; $("#install-button").hidden = false; });
  $("#install-button").addEventListener("click", async () => { if (!state.installPrompt) return; state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $("#install-button").hidden = true; });
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
    $("#last-updated").textContent = state.data.lastUpdatedDisplay;
    populateFilters(); renderAll(); $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Datos renovados";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta python scripts/build_dashboard.py.`; $("#error-banner").hidden = false;
  } finally { $("#refresh-button").disabled = false; }
}

bindEvents(); updateConnection(); loadData();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
