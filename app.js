const state = {
  data: null,
  filters: { dm: "", store: "", activity: "" },
  evidenceFilters: { dm: "", store: "", activity: "" },
  showAllEvidence: false,
  exporting: false,
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

function regionalMetrics() {
  const activities = state.data.activities.map((item) => item.name);
  const expected = state.data.stores.length * activities.length;
  const completed = state.data.stores.reduce((sum, store) => sum + completionFor(store, activities).completed, 0);
  return { completed, expected, compliance: expected ? completed / expected * 100 : 0 };
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
    const expected = dmStores.length * activities.length;
    return { ...dm, dmStores, completed, expected, value: expected ? completed / expected * 100 : 0 };
  }).sort((a, b) => b.value - a.value || a.shortName.localeCompare(b.shortName, "es-MX"));
}

function exportMode() {
  return state.filters.dm || state.filters.store ? "stores" : "dms";
}

function exportRows() {
  if (exportMode() === "dms") {
    return dmRanking().map((item, index) => ({
      kind: "dm", rank: index + 1, label: item.shortName, detail: `${item.dmStores.length} tiendas`, photo: item.photo,
      completed: item.completed, expected: item.expected, pending: item.expected - item.completed, value: item.value,
    }));
  }
  const activities = selectedActivities();
  return filteredStores().map((store) => {
    const result = completionFor(store, activities);
    return {
      kind: "store", label: store.store, detail: `CeCo ${store.ceco}`, ceco: store.ceco, dm: store.dm,
      completed: result.completed, expected: result.expected, pending: result.pending, value: result.compliance,
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
      <span class="dm-copy"><strong>${esc(dm.shortName)}</strong><em>${dm.dmStores.length} tiendas · ${dm.completed}/${dm.expected} realizadas</em></span>
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
      <td><div class="table-progress ${signal.tone}"><span><i style="--progress:${Math.min(store.compliance, 100)}%"></i></span><b>${percent(store.compliance)}</b></div></td>
      <td><span class="status ${signal.tone}">${signal.label}</span></td>
    </tr>`;
  }).join("") : '<tr><td colspan="7"><div class="empty-state">Sin tiendas para mostrar.</div></td></tr>';
}

function renderAll() {
  renderSummary(); renderActivities(); renderCommitments(); renderEvidence(); renderTeam(); renderStores();
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

function reportScope() {
  return state.filters.store ? `Tienda · ${currentScope()}` : state.filters.dm ? `DM · ${state.filters.dm}` : `Región · ${state.data.region}`;
}

function renderReportSheet() {
  const rows = exportRows();
  const meta = reportMeta();
  const regional = regionalMetrics();
  const current = metrics();
  const mode = exportMode();
  const director = meta.regionalDirector || { name: "Jorge Alcantar", role: "Director Regional" };
  $("#report-sheet").innerHTML = `<header class="report-header">
    <img src="./assets/icons/icon-64.webp" alt="" width="68" height="68">
    <div><small>${esc(meta.motto)}</small><h1>${esc(meta.title)}</h1><p>${esc(meta.subtitle)} · ${esc(reportScope())}</p></div>
    <div class="report-cut"><span>Fecha de corte</span><strong>${esc(cutStamp())}</strong><span>${mode === "dms" ? "Avance regional" : "Avance del filtro"}</span><b>${percent(mode === "dms" ? regional.compliance : current.compliance)}</b></div>
  </header>
  <table class="report-table"><thead><tr><th>Ranking</th><th>${mode === "dms" ? "DM" : "Tienda / CeCo"}</th><th>Realizadas</th><th>Total</th><th>Pendientes</th><th>% Avance</th></tr></thead><tbody>${rows.map((item) => {
    const signal = semaphore(item.value);
    const identity = item.kind === "dm"
      ? `<div class="report-dm"><img src="./${esc(item.photo)}" alt=""><strong>${esc(item.label)}</strong></div>`
      : `<div class="report-store"><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></div>`;
    return `<tr><td><span class="table-rank">${item.rank}</span></td><td>${identity}</td><td>${item.completed}</td><td>${item.expected}</td><td>${item.pending}</td><td><span class="status ${signal.tone}">${percent(item.value)}</span></td></tr>`;
  }).join("")}</tbody></table>
  <footer class="report-footer"><strong>${esc(meta.motto)}</strong><span>${esc(director.role)} · ${esc(director.name)}</span><span>${esc(meta.credits)}</span></footer>`;
}

async function exportPdf() {
  if (!await beginExport("PDF")) return;
  renderReportSheet();
  $("#export-modal").hidden = true;
  document.body.style.overflow = "";
  document.body.classList.add("printing-report");
  $("#report-sheet").setAttribute("aria-hidden", "false");
  const filename = `Sistema_Evidencia_OPS_${fileSafe(reportScope())}_Corte_${cutDate().replaceAll("/", "-")}.pdf`;
  const cleanup = () => {
    document.body.classList.remove("printing-report"); $("#report-sheet").setAttribute("aria-hidden", "true");
    finishExport(filename);
  };
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
  if (!await beginExport("imagen")) return;
  try {
    const rows = exportRows();
    const meta = reportMeta();
    const regional = regionalMetrics();
    const current = metrics();
    const mode = exportMode();
    const director = meta.regionalDirector || { name: "Jorge Alcantar", role: "Director Regional" };
    const width = 1600; const headerHeight = 230; const tableHeader = 72; const rowHeight = mode === "dms" ? 148 : 108; const footerHeight = 110;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = headerHeight + tableHeader + Math.max(rows.length, 1) * rowHeight + footerHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f6f8f7"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#006241"; context.fillRect(0, 0, width, headerHeight);
    const assets = await Promise.all([loadImage("./assets/icons/icon-64.webp"), ...rows.map((item) => item.photo ? loadImage(`./${item.photo}`) : Promise.resolve(null))]);
    const [logo, ...photos] = assets;
    if (logo) context.drawImage(logo, 72, 70, 78, 78);
    context.fillStyle = "#b9e1d0"; context.font = "700 20px Segoe UI, sans-serif"; context.fillText(meta.motto, 180, 58);
    context.fillStyle = "#ffffff"; context.font = "700 42px Segoe UI, sans-serif"; context.fillText(meta.title, 180, 108);
    context.font = "400 23px Segoe UI, sans-serif"; context.fillText(`${meta.subtitle} · ${reportScope()}`, 180, 148);
    context.fillStyle = "#b9e1d0"; context.font = "600 18px Segoe UI, sans-serif"; context.fillText(mode === "dms" ? "Ranking dinámico por Gerente de Distrito" : "Tiendas ordenadas de mayor a menor avance", 180, 184);
    context.textAlign = "right"; context.fillStyle = "#b9e1d0"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText("FECHA DE CORTE", 1525, 48);
    context.fillStyle = "#ffffff"; context.font = "700 27px Segoe UI, sans-serif"; context.fillText(cutStamp(), 1525, 81);
    context.fillStyle = "#b9e1d0"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText(mode === "dms" ? "AVANCE REGIONAL" : "AVANCE DEL FILTRO", 1525, 133);
    context.fillStyle = "#ffffff"; context.font = "800 40px Segoe UI, sans-serif"; context.fillText(percent(mode === "dms" ? regional.compliance : current.compliance), 1525, 177);
    if (mode !== "dms") { context.fillStyle = "#b9e1d0"; context.font = "600 16px Segoe UI, sans-serif"; context.fillText(`Regional ${percent(regional.compliance)}`, 1525, 204); }
    context.textAlign = "left";
    const top = headerHeight; context.fillStyle = "#e5efea"; context.fillRect(0, top, width, tableHeader);
    context.fillStyle = "#42564d"; context.font = "700 17px Segoe UI, sans-serif";
    context.fillText("RANKING", 70, top + 45); context.fillText(mode === "dms" ? "DM" : "TIENDA / CECO", 190, top + 45); context.fillText("REALIZADAS", 905, top + 45); context.fillText("TOTAL", 1120, top + 45); context.fillText("PENDIENTES", 1280, top + 45); context.fillText("% AVANCE", 1450, top + 45);
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
      context.fillStyle = "#1e3932"; context.font = "700 28px Segoe UI, sans-serif"; context.fillText(String(item.completed), 940, centerY + 10); context.fillText(String(item.expected), 1145, centerY + 10); context.fillText(String(item.pending), 1325, centerY + 10);
      context.fillStyle = signal.tone === "green" ? "#16845b" : signal.tone === "amber" ? "#a86b0a" : "#a2352a"; context.font = "800 31px Segoe UI, sans-serif"; context.fillText(percent(item.value), 1460, centerY + 10);
    });
    const footerY = canvas.height - footerHeight; context.fillStyle = "#1e3932"; context.fillRect(0, footerY, width, footerHeight);
    context.fillStyle = "#ffffff"; context.font = "800 23px Segoe UI, sans-serif"; context.fillText(meta.motto, 72, footerY + 48);
    context.fillStyle = "#cce0d7"; context.font = "400 18px Segoe UI, sans-serif"; context.fillText(meta.credits, 72, footerY + 79);
    context.textAlign = "right"; context.fillStyle = "#ffffff"; context.font = "700 18px Segoe UI, sans-serif"; context.fillText(`${director.role} · ${director.name}`, 1525, footerY + 64); context.textAlign = "left";
    const filename = `Sistema_Evidencia_OPS_${fileSafe(reportScope())}_Corte_${cutDate().replaceAll("/", "-")}.png`;
    const link = document.createElement("a"); link.href = canvas.toDataURL("image/png"); link.download = filename; link.click();
    finishExport(filename);
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
  $("#export-modal-kicker").textContent = `Preparando ${format}`;
  $("#export-modal-title").textContent = "Estamos creando tu reporte";
  $("#export-modal-message").textContent = exportMode() === "dms"
    ? `La vista regional exportará ${exportRows().length} DM con el filtro actual.`
    : `La vista filtrada exportará ${exportRows().length} tiendas ordenadas de mayor a menor avance.`;
  $("#export-modal-close").hidden = true;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  await new Promise((resolve) => setTimeout(resolve, 700));
  return true;
}

function finishExport(filename) {
  const modal = $("#export-modal");
  modal.hidden = false;
  modal.querySelector(".export-card").classList.add("complete");
  $("#export-modal-image").src = "./assets/ui/Un_placer_haber_Ayudado.webp";
  $("#export-modal-image").alt = "Un placer haber ayudado";
  $("#export-modal-kicker").textContent = "Exportación completada";
  $("#export-modal-title").textContent = "Tu reporte está listo";
  $("#export-modal-message").textContent = filename;
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
  $("#export-modal-close").hidden = false;
  state.exporting = false;
  setExportButtonsDisabled(false);
}

function closeExportModal() {
  if (state.exporting) return;
  $("#export-modal").hidden = true;
  document.body.style.overflow = "";
  $("#export-image").focus();
}

function buildExcelSpec() {
  const item = metrics();
  const rows = exportRows();
  const mode = exportMode();
  const scope = reportScope();
  const detailHeaders = ["Ranking", mode === "dms" ? "DM" : "Tienda", "CeCo", "Realizadas", "Total", "Pendientes", "% Avance", "Estado"];
  const detailRows = rows.map((row) => [row.rank, row.label, row.ceco || "—", row.completed, row.expected, row.pending, row.value / 100, semaphore(row.value).label]);
  const stores = filteredStores();
  const activities = state.data.activities.filter((activity) => !state.filters.activity || activity.name === state.filters.activity);
  const activityRows = activities.map((activity, index) => {
    const completed = stores.filter((store) => store.activities[activity.name]).length;
    const value = stores.length ? completed / stores.length : 0;
    return [index + 1, activity.name, completed, stores.length - completed, stores.length, value, activity.commitmentDateDisplay || "Sin fecha"];
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
          ["Indicador", "Valor", "Lectura rápida"],
          ["Avance del filtro", item.compliance / 100, `${item.completed} de ${item.expected} actividades realizadas`],
          [mode === "dms" ? "DM incluidos" : "Tiendas incluidas", mode === "dms" ? item.dms : item.stores, mode === "dms" ? "Ranking por DM" : "Ordenadas de mayor a menor avance"],
          ["Tiendas con avance", item.completedStores, `${item.notStartedStores} tiendas sin iniciar`],
          ["Pendientes", item.pending, `Actividad: ${state.filters.activity || "Todas"}`],
        ],
        widths: [24, 18, 46], merges: ["A1:C1", "A2:C2"], headerRows: [4], percentColumns: [2], freezeRow: 4, autoFilter: "A4:C8",
      },
      {
        name: mode === "dms" ? "Ranking DM" : "Tiendas",
        rows: [[mode === "dms" ? "Ranking por DM" : "Desglose de tiendas", "", "", "", "", "", "", ""], [`${scope} · Mayor a menor avance`, "", "", "", "", "", "", ""], [], detailHeaders, ...detailRows],
        widths: [10, 32, 13, 14, 12, 14, 14, 16], merges: ["A1:H1", "A2:H2"], headerRows: [4], percentColumns: [7], freezeRow: 4, autoFilter: `A4:H${4 + detailRows.length}`,
      },
      {
        name: "Actividades",
        rows: [["Avance por actividad", "", "", "", "", "", ""], [`${scope} · Corte ${cutStamp()}`, "", "", "", "", "", ""], [], ["Orden", "Actividad", "Realizadas", "Pendientes", "Total", "% Avance", "Fecha compromiso"], ...activityRows],
        widths: [10, 42, 14, 14, 12, 14, 20], merges: ["A1:G1", "A2:G2"], headerRows: [4], percentColumns: [6], freezeRow: 4, autoFilter: `A4:G${4 + activityRows.length}`,
      },
    ],
  };
}

async function exportExcel() {
  if (!await beginExport("Excel")) return;
  try {
    if (!window.OPSXlsx) throw new Error("El motor XLSX no está disponible.");
    const filename = `Sistema_Evidencia_OPS_${fileSafe(reportScope())}_Corte_${cutDate().replaceAll("/", "-")}.xlsx`;
    window.OPSXlsx.downloadWorkbook(buildExcelSpec(), filename);
    finishExport(filename);
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
  $("#export-modal-close").addEventListener("click", closeExportModal);
  $("#export-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeExportModal(); });
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
  $("#refresh-button").addEventListener("click", () => loadData(true));
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

bindEvents(); updateConnection(); loadData();
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
