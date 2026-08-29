const state = { data: null, filters: { dm: "", store: "", activity: "" }, installPrompt: null };

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
  const completed = activities.reduce((sum, activity) => sum + (store.activities[activity] ? 1 : 0), 0);
  const expected = activities.length;
  return { completed, expected, pending: expected - completed, compliance: expected ? completed / expected * 100 : 0 };
}

function metrics() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const storeProgress = stores.map((store) => completionFor(store, activities));
  const expected = stores.length * activities.length;
  const completed = storeProgress.reduce((sum, item) => sum + item.completed, 0);
  return {
    dms: new Set(stores.map((store) => store.dm)).size,
    stores: stores.length,
    activities: activities.length,
    completed,
    expected,
    pending: expected - completed,
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

function renderSummary() {
  const item = metrics();
  const signal = semaphore(item.compliance);
  $("#score-value").textContent = percent(item.compliance);
  $("#score-ring").dataset.tone = signal.tone;
  $("#score-ring").style.setProperty("--score", `${Math.min(item.compliance, 100) * 3.6}deg`);
  $("#score-title").textContent = currentScope();
  $("#score-message").textContent = item.pending
    ? `${number(item.completed)} de ${number(item.expected)} actividades realizadas · ${signal.label}.`
    : "El alcance seleccionado está completo.";
  $("#kpi-grid").innerHTML = [
    [number(item.dms), "DM"],
    [number(item.activities), "Actividades"],
    [number(item.completedStores), "Tiendas realizadas"],
    [number(item.notStartedStores), "Tiendas sin iniciar"],
  ].map(([value, label]) => `<article class="kpi"><strong>${value}</strong><span>${label}</span></article>`).join("");
}

function renderActivities() {
  const stores = filteredStores();
  const activities = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#activity-context").textContent = `${currentScope()} · ${activities.length} ${activities.length === 1 ? "actividad" : "actividades"}`;
  $("#activity-progress").innerHTML = activities.length ? activities.map((item) => {
    const completed = stores.filter((store) => store.activities[item.name]).length;
    const value = stores.length ? completed / stores.length * 100 : 0;
    const signal = semaphore(value);
    return `<article class="progress-item ${signal.tone}">
      <span class="traffic-light" aria-hidden="true"></span>
      <div class="progress-title"><strong>${esc(item.name)}</strong><span>${esc(item.description || "Actividad vigente")}</span></div>
      <div class="bar" aria-label="${percent(value)} de avance"><span style="--progress:${Math.min(value, 100)}%"></span></div>
      <div class="progress-number"><strong>${percent(value)}</strong><small>${completed}/${stores.length} tiendas</small></div>
      <span class="status ${signal.tone}">${signal.label}</span>
    </article>`;
  }).join("") : '<div class="empty-state">No hay actividades para el filtro seleccionado.</div>';
}

function renderTeam() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const activeDms = new Set(stores.map((store) => store.dm));
  const rows = state.data.dms.filter((dm) => activeDms.has(dm.dm)).map((dm) => {
    const dmStores = stores.filter((store) => store.dm === dm.dm);
    const completed = dmStores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
    const expected = dmStores.length * activities.length;
    return { ...dm, dmStores, completed, expected, value: expected ? completed / expected * 100 : 0 };
  }).sort((a, b) => b.value - a.value || a.shortName.localeCompare(b.shortName, "es-MX"));

  $("#dm-team").innerHTML = rows.map((dm, index) => {
    const signal = semaphore(dm.value);
    const rank = index < 3 ? ["🥇", "🥈", "🥉"][index] : `#${index + 1}`;
    return `<button type="button" class="dm-card ${signal.tone} ${state.filters.dm === dm.dm ? "selected" : ""}" data-dm-focus="${esc(dm.dm)}">
      <span class="rank-icon" aria-label="Posición ${index + 1}">${rank}</span>
      <img src="./${esc(dm.photo)}" alt="Fotografía de ${esc(dm.shortName)}" loading="lazy">
      <span class="dm-copy"><small>Gerente de Distrito</small><strong>${esc(dm.shortName)}</strong><em>${dm.dmStores.length} tiendas · ${dm.completed}/${dm.expected} realizadas</em></span>
      <span class="dm-result"><strong>${percent(dm.value)}</strong><small class="status ${signal.tone}">${signal.label}</small></span>
    </button>`;
  }).join("") || '<div class="empty-state">Sin gerentes para el filtro seleccionado.</div>';
}

function renderStores() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .sort((a, b) => b.compliance - a.compliance || b.completed - a.completed || a.store.localeCompare(b.store, "es-MX"));
  const total = rows.reduce((sum, row) => sum + row.completed, 0);
  const expected = rows.reduce((sum, row) => sum + row.expected, 0);
  $("#store-summary").textContent = `${rows.length} tiendas · ${total}/${expected} actividades realizadas · ordenadas de mayor a menor`;
  $("#store-table").innerHTML = rows.length ? rows.map((store, index) => {
    const signal = semaphore(store.compliance);
    return `<tr>
      <td><span class="table-rank">${index + 1}</span></td><td><strong>${esc(store.ceco)}</strong></td><td>${esc(store.store)}</td><td>${esc(store.dm)}</td>
      <td><strong>${store.completed}/${store.expected}</strong></td>
      <td><div class="table-progress ${signal.tone}"><span><i style="--progress:${Math.min(store.compliance, 100)}%"></i></span><b>${percent(store.compliance)}</b></div></td>
      <td><span class="status ${signal.tone}">${signal.label}</span></td>
    </tr>`;
  }).join("") : '<tr><td colspan="7"><div class="empty-state">Sin tiendas para mostrar.</div></td></tr>';
}

function updateExportLabel() {
  $("#export-label").textContent = state.filters.store ? "Exportar tienda" : state.filters.dm ? "Exportar DM" : "Exportar región";
}

function renderAll() {
  renderSummary(); renderActivities(); renderTeam(); renderStores(); updateExportLabel();
}

function populateFilters() {
  const dms = [...new Set(state.data.stores.map((store) => store.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#filter-dm").innerHTML = '<option value="">Todos los DM</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  $("#filter-dm").value = state.filters.dm;
  const stores = state.data.stores.filter((store) => !state.filters.dm || store.dm === state.filters.dm);
  $("#filter-store").innerHTML = '<option value="">Todas las tiendas</option>' + stores.map((store) => `<option value="${esc(store.ceco)}">${esc(store.ceco)} · ${esc(store.store)}</option>`).join("");
  if (!stores.some((store) => store.ceco === state.filters.store)) state.filters.store = "";
  $("#filter-store").value = state.filters.store;
  $("#filter-activity").innerHTML = '<option value="">Todas las actividades</option>' + state.data.activities.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  $("#filter-activity").value = state.filters.activity;
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function fileSafe(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function exportCsv() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => {
    const item = completionFor(store, activities);
    const signal = semaphore(item.compliance);
    return { compliance: item.compliance, store: store.store, values: [store.ceco, store.store, store.dm, item.completed, item.expected, item.pending, percent(item.compliance), signal.label,
      ...activities.map((activity) => store.activities[activity] ? "Realizada" : "Sin iniciar")] };
  }).sort((a, b) => b.compliance - a.compliance || a.store.localeCompare(b.store, "es-MX")).map((item) => item.values);
  const metadata = [["Sistema", state.data.project], ["Región", state.data.region], ["Filtro", currentScope()], ["Fecha de corte", cutDate()], []];
  const header = ["CeCo", "Tienda", "DM", "Realizadas", "Actividades", "Pendientes", "Cumplimiento", "Semáforo", ...activities];
  const csv = [...metadata, header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const scope = state.filters.store ? `Tienda_${currentScope()}` : state.filters.dm ? `DM_${state.filters.dm}` : `Region_${state.data.region}`;
  const date = cutDate().replaceAll("/", "-");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = `Sistema_Evidencias_OPS_${fileSafe(scope)}_Corte_${date}.csv`;
  link.click(); URL.revokeObjectURL(link.href);
}

function bindEvents() {
  $("#filter-dm").addEventListener("change", (event) => { state.filters.dm = event.target.value; state.filters.store = ""; populateFilters(); renderAll(); });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => { state.filters.activity = event.target.value; renderAll(); });
  $("#clear-filters").addEventListener("click", () => { state.filters = { dm: "", store: "", activity: "" }; populateFilters(); renderAll(); });
  $("#export-csv").addEventListener("click", exportCsv);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dm-focus]");
    if (!button) return;
    state.filters.dm = state.filters.dm === button.dataset.dmFocus ? "" : button.dataset.dmFocus;
    state.filters.store = ""; populateFilters(); renderAll(); $("#resumen")?.scrollIntoView({ behavior: "smooth" });
  });
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
    $("#last-updated").textContent = cutDate();
    populateFilters(); renderAll(); $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Datos renovados";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta python scripts/build_dashboard.py.`; $("#error-banner").hidden = false;
  } finally { $("#refresh-button").disabled = false; }
}

bindEvents(); updateConnection(); loadData();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
