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

function dmRanking() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const activeDms = new Set(stores.map((store) => store.dm));
  return state.data.dms.filter((dm) => activeDms.has(dm.dm)).map((dm) => {
    const dmStores = stores.filter((store) => store.dm === dm.dm);
    const completed = dmStores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
    const expected = dmStores.length * activities.length;
    return { ...dm, dmStores, completed, expected, value: expected ? completed / expected * 100 : 0 };
  }).sort((a, b) => b.value - a.value || a.shortName.localeCompare(b.shortName, "es-MX"));
}

function renderTeam() {
  const rows = dmRanking();

  $("#dm-team").innerHTML = rows.map((dm, index) => {
    const signal = semaphore(dm.value);
    const rank = index < 3 ? ["🥇", "🥈", "🥉"][index] : `#${index + 1}`;
    return `<button type="button" class="dm-card ${signal.tone} ${state.filters.dm === dm.dm ? "selected" : ""}" data-dm-focus="${esc(dm.dm)}">
      <span class="rank-icon" aria-label="Posición ${index + 1}">${rank}</span>
      <img src="./${esc(dm.photo)}" alt="Fotografía de ${esc(dm.shortName)}" loading="lazy">
      <span class="dm-copy"><strong>${esc(dm.shortName)}</strong><em>${dm.dmStores.length} tiendas · ${dm.completed}/${dm.expected} realizadas</em></span>
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
  $("#store-summary").textContent = `${rows.length} tiendas · ${total}/${expected} actividades realizadas`;
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

function renderAll() {
  renderSummary(); renderActivities(); renderCommitments(); renderTeam(); renderStores();
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

function fileSafe(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function reportScope() {
  return state.filters.store ? `Tienda · ${currentScope()}` : state.filters.dm ? `DM · ${state.filters.dm}` : `Región · ${state.data.region}`;
}

function renderReportSheet() {
  const rows = dmRanking();
  const meta = reportMeta();
  $("#report-sheet").innerHTML = `<header class="report-header">
    <img src="./assets/icons/icon-64.webp" alt="" width="68" height="68">
    <div><small>${esc(meta.motto)}</small><h1>${esc(meta.title)}</h1><p>${esc(meta.subtitle)} · ${esc(reportScope())}</p></div>
    <div class="report-cut"><span>Fecha de corte</span><strong>${esc(cutStamp())}</strong></div>
  </header>
  <table class="report-table"><thead><tr><th>DM</th><th>Actividades realizadas</th><th>Actividades totales</th><th>% Avance</th></tr></thead><tbody>${rows.map((dm) => {
    const signal = semaphore(dm.value);
    return `<tr><td><div class="report-dm"><img src="./${esc(dm.photo)}" alt=""><strong>${esc(dm.shortName)}</strong></div></td><td>${dm.completed}</td><td>${dm.expected}</td><td><span class="status ${signal.tone}">${percent(dm.value)}</span></td></tr>`;
  }).join("")}</tbody></table>
  <footer class="report-footer"><strong>${esc(meta.motto)}</strong><span>${esc(meta.credits)}</span></footer>`;
}

function exportPdf() {
  renderReportSheet();
  document.body.classList.add("printing-report");
  $("#report-sheet").setAttribute("aria-hidden", "false");
  const cleanup = () => { document.body.classList.remove("printing-report"); $("#report-sheet").setAttribute("aria-hidden", "true"); };
  window.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => window.print(), 50);
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

async function exportImage() {
  const rows = dmRanking();
  const meta = reportMeta();
  const width = 1600; const headerHeight = 210; const tableHeader = 72; const rowHeight = 148; const footerHeight = 110;
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = headerHeight + tableHeader + rows.length * rowHeight + footerHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f6f8f7"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#006241"; context.fillRect(0, 0, width, headerHeight);
  const [logo, ...photos] = await Promise.all([loadImage("./assets/icons/icon-64.webp"), ...rows.map((dm) => loadImage(`./${dm.photo}`))]);
  if (logo) context.drawImage(logo, 72, 64, 78, 78);
  context.fillStyle = "#b9e1d0"; context.font = "700 20px Segoe UI, sans-serif"; context.fillText(meta.motto, 180, 58);
  context.fillStyle = "#ffffff"; context.font = "700 42px Segoe UI, sans-serif"; context.fillText(meta.title, 180, 108);
  context.font = "400 23px Segoe UI, sans-serif"; context.fillText(`${meta.subtitle} · ${reportScope()}`, 180, 148);
  context.textAlign = "right"; context.fillStyle = "#b9e1d0"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText("FECHA DE CORTE", 1525, 82);
  context.fillStyle = "#ffffff"; context.font = "700 30px Segoe UI, sans-serif"; context.fillText(cutStamp(), 1525, 122); context.textAlign = "left";
  const top = headerHeight; context.fillStyle = "#e5efea"; context.fillRect(0, top, width, tableHeader);
  context.fillStyle = "#42564d"; context.font = "700 20px Segoe UI, sans-serif";
  context.fillText("DM", 190, top + 45); context.fillText("ACTIVIDADES REALIZADAS", 820, top + 45); context.fillText("ACTIVIDADES TOTALES", 1110, top + 45); context.fillText("% AVANCE", 1390, top + 45);
  rows.forEach((dm, index) => {
    const y = top + tableHeader + index * rowHeight; const signal = semaphore(dm.value);
    context.fillStyle = index % 2 ? "#f4f7f5" : "#ffffff"; context.fillRect(0, y, width, rowHeight - 2);
    context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#c98612" : "#c54435"; context.fillRect(0, y, 12, rowHeight - 2);
    context.save(); context.beginPath(); context.arc(105, y + 72, 46, 0, Math.PI * 2); context.clip(); drawCover(context, photos[index], 59, y + 26, 92, 92); context.restore();
    context.fillStyle = "#1e3932"; context.font = "700 28px Segoe UI, sans-serif"; context.fillText(dm.shortName, 190, y + 67);
    context.fillStyle = "#65756d"; context.font = "400 20px Segoe UI, sans-serif"; context.fillText(`${dm.dmStores.length} tiendas`, 190, y + 99);
    context.fillStyle = "#1e3932"; context.font = "700 30px Segoe UI, sans-serif"; context.fillText(String(dm.completed), 930, y + 82); context.fillText(String(dm.expected), 1210, y + 82);
    context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#a86b0a" : "#a2352a"; context.font = "800 34px Segoe UI, sans-serif"; context.fillText(percent(dm.value), 1410, y + 82);
  });
  const footerY = canvas.height - footerHeight; context.fillStyle = "#1e3932"; context.fillRect(0, footerY, width, footerHeight);
  context.fillStyle = "#ffffff"; context.font = "800 23px Segoe UI, sans-serif"; context.fillText(meta.motto, 72, footerY + 48);
  context.fillStyle = "#cce0d7"; context.font = "400 18px Segoe UI, sans-serif"; context.fillText(meta.credits, 72, footerY + 79);
  const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = `Sistema_Evidencia_OPS_${fileSafe(reportScope())}_Corte_${cutDate().replaceAll("/", "-")}.png`; link.click();
}

function bindEvents() {
  $("#filter-dm").addEventListener("change", (event) => { state.filters.dm = event.target.value; state.filters.store = ""; populateFilters(); renderAll(); });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => { state.filters.activity = event.target.value; renderAll(); });
  $("#clear-filters").addEventListener("click", () => { state.filters = { dm: "", store: "", activity: "" }; populateFilters(); renderAll(); });
  $("#export-image").addEventListener("click", exportImage);
  $("#export-pdf").addEventListener("click", exportPdf);
  $("#toggle-dates").addEventListener("click", () => {
    const panel = $("#commitment-dates"); panel.hidden = !panel.hidden;
    $("#toggle-dates").setAttribute("aria-expanded", String(!panel.hidden));
  });
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
    $("#last-updated").textContent = cutStamp();
    populateFilters(); renderAll(); $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Datos renovados";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta python scripts/build_dashboard.py.`; $("#error-banner").hidden = false;
  } finally { $("#refresh-button").disabled = false; }
}

bindEvents(); updateConnection(); loadData();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
