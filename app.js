const state = {
  data: null,
  route: "resumen",
  filters: { dm: "", store: "", activity: "" },
  installPrompt: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);
const percent = (value) => `${Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%`;
const number = (value) => Number(value || 0).toLocaleString("es-MX");

const ROUTES = {
  resumen: ["Resumen ejecutivo", "Seguimiento de cumplimiento operativo"],
  equipo: ["Equipo DM", "Responsables y avance por portafolio"],
  actividades: ["Actividades", "Catálogo dinámico del Forms"],
  tiendas: ["Tiendas", "Cumplimiento por CeCo y DM"],
  evidencias: ["Evidencias", "Registros confirmados desde Forms"],
};

function svg(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

const KPI_ICONS = {
  compliance: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  stores: svg('<path d="M4 10h16M6 10v10h12V10M3 10l2-6h14l2 6M9 20v-5h6v5"/>'),
  activities: svg('<path d="M5 4h14v16H5zM8 9l1.5 1.5L12 8M8 15l1.5 1.5L12 14M14 9h2M14 15h2"/>'),
  responses: svg('<path d="M4 5h16v14H4zM8 9h.01M4 16l5-4 3 3 2-2 6 5"/>'),
};

function completionFor(store, activities) {
  const completed = activities.reduce((total, activity) => total + (store.activities[activity] ? 1 : 0), 0);
  return {
    completed,
    expected: activities.length,
    compliance: activities.length ? completed / activities.length * 100 : 0,
  };
}

function selectedActivities() {
  if (state.filters.activity) return [state.filters.activity];
  return state.data.activities.map((item) => item.name);
}

function filteredStores() {
  return state.data.stores.filter((store) => {
    if (state.filters.dm && store.dm !== state.filters.dm) return false;
    if (state.filters.store && store.ceco !== state.filters.store) return false;
    return true;
  });
}

function filteredSubmissions() {
  return state.data.submissions.filter((item) => {
    if (state.filters.dm && item.dm !== state.filters.dm) return false;
    if (state.filters.store && item.ceco !== state.filters.store) return false;
    if (state.filters.activity && item.activity !== state.filters.activity) return false;
    return true;
  });
}

function currentMetrics() {
  const stores = filteredStores();
  const activities = selectedActivities();
  const expected = stores.length * activities.length;
  const completed = stores.reduce((total, store) => total + completionFor(store, activities).completed, 0);
  const validResponses = filteredSubmissions().filter((item) => item.valid).length;
  const storesComplete = stores.filter((store) => {
    const result = completionFor(store, activities);
    return result.expected > 0 && result.completed === result.expected;
  }).length;
  return {
    stores: stores.length,
    activities: activities.length,
    expected,
    completed,
    compliance: expected ? completed / expected * 100 : 0,
    validResponses,
    storesComplete,
  };
}

function statusBadge(value, expected) {
  if (expected && value === expected) return '<span class="badge">Completo</span>';
  if (value > 0) return '<span class="badge pending">En avance</span>';
  return '<span class="badge neutral">Sin registro</span>';
}

function renderKpis() {
  const metrics = currentMetrics();
  const cards = [
    ["Avance total", percent(metrics.compliance), `${number(metrics.completed)} de ${number(metrics.expected)} cumplimientos`, "compliance"],
    ["Tiendas completas", number(metrics.storesComplete), `${number(metrics.stores - metrics.storesComplete)} requieren seguimiento`, "stores"],
    ["Actividades", number(metrics.activities), state.filters.activity ? "Una actividad seleccionada" : "Catálogo activo del CMS", "activities"],
    ["Evidencias válidas", number(metrics.validResponses), "Sí + CeCo + evidencia", "responses"],
  ];
  $("#kpi-grid").innerHTML = cards.map(([label, value, detail, icon]) => `
    <article class="kpi-card">
      <span class="kpi-label">${esc(label)}</span><span class="kpi-icon">${KPI_ICONS[icon]}</span>
      <strong>${esc(value)}</strong><small>${esc(detail)}</small>
    </article>`).join("");
}

function renderExecutivePulse() {
  const metrics = currentMetrics();
  const pending = Math.max(metrics.expected - metrics.completed, 0);
  const scope = state.filters.store
    ? filteredStores()[0]?.store || "Tienda"
    : state.filters.dm || state.data.region;
  $("#pulse-value").textContent = percent(metrics.compliance);
  $("#pulse-ring").style.setProperty("--pulse", `${Math.min(metrics.compliance, 100) * 3.6}deg`);
  $("#pulse-title").textContent = scope;
  $("#pulse-message").textContent = pending
    ? `${number(pending)} actividades pendientes. Prioriza las tiendas sin registro y valida la evidencia más reciente.`
    : "El alcance seleccionado está completo. Mantén la validación de evidencias al día.";
}

function renderActivityProgress() {
  const stores = filteredStores();
  const visible = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#activity-context").textContent = state.filters.store
    ? stores[0]?.store || "Tienda"
    : state.filters.dm || state.data.region;
  $("#activity-progress").innerHTML = visible.length ? visible.map((item) => {
    const completed = stores.filter((store) => store.activities[item.name]).length;
    const compliance = stores.length ? completed / stores.length * 100 : 0;
    return `<div class="progress-item">
      <div class="progress-copy"><strong>${esc(item.name)}</strong><small>${completed} de ${stores.length} tiendas</small></div>
      <div class="track" aria-label="${esc(item.name)} ${percent(compliance)}"><span style="--progress:${Math.min(compliance, 100)}%"></span></div>
      <div class="progress-value"><strong>${percent(compliance)}</strong><small>${stores.length - completed} pendientes</small></div>
    </div>`;
  }).join("") : '<div class="empty-state">No hay actividades para la selección actual.</div>';
}

function renderDmRanking() {
  const activities = selectedActivities();
  const grouped = new Map();
  filteredStores().forEach((store) => {
    if (!grouped.has(store.dm)) grouped.set(store.dm, []);
    grouped.get(store.dm).push(store);
  });
  const rows = [...grouped.entries()].map(([dm, stores]) => {
    const completed = stores.reduce((total, store) => total + completionFor(store, activities).completed, 0);
    const expected = stores.length * activities.length;
    return { dm, stores: stores.length, completed, expected, compliance: expected ? completed / expected * 100 : 0 };
  }).sort((a, b) => b.compliance - a.compliance || a.dm.localeCompare(b.dm, "es-MX"));
  $("#dm-ranking").innerHTML = rows.length ? rows.map((item, index) => {
    const profile = state.data.dms.find((dm) => dm.dm === item.dm) || {};
    return `
    <button class="ranking-item ranking-button" type="button" data-dm-focus="${esc(item.dm)}"><span class="ranking-position">${index + 1}</span>
      ${profile.photo ? `<img class="ranking-photo" src="./${esc(profile.photo)}" alt="">` : '<span class="ranking-photo fallback" aria-hidden="true">DM</span>'}
      <div class="ranking-copy"><strong>${esc(item.dm)}</strong><small>${item.stores} tiendas · ${item.completed}/${item.expected}</small></div>
      <strong>${percent(item.compliance)}</strong>
    </button>`;
  }).join("") : '<div class="empty-state">Sin información para mostrar.</div>';
}

function renderDmTeam() {
  const visible = state.data.dms.filter((item) => !state.filters.dm || item.dm === state.filters.dm);
  $("#dm-team").innerHTML = visible.length ? visible.map((item) => `
    <article class="dm-card">
      <div class="dm-photo-wrap">
        ${item.photo ? `<img src="./${esc(item.photo)}" alt="Fotografía de ${esc(item.shortName)}" loading="lazy">` : '<div class="dm-photo-placeholder">DM</div>'}
        <span class="dm-status ${item.compliance === 100 ? "complete" : item.compliance > 0 ? "progress" : "empty"}">${esc(item.status)}</span>
      </div>
      <div class="dm-card-body">
        <p class="eyebrow">Gerente de Distrito</p><h3>${esc(item.shortName)}</h3><small>${esc(item.dm)}</small>
        <div class="dm-score"><strong>${percent(item.compliance)}</strong><span>${item.completed}/${item.expected} cumplimientos</span></div>
        <div class="track"><span style="--progress:${Math.min(item.compliance, 100)}%"></span></div>
        <div class="dm-facts"><span><strong>${item.stores}</strong> tiendas</span><span><strong>${item.pending}</strong> pendientes</span></div>
        <button class="button secondary" type="button" data-dm-focus="${esc(item.dm)}" data-target="tiendas">Ver portafolio</button>
      </div>
    </article>`).join("") : '<div class="empty-state">No hay Gerentes de Distrito para la selección actual.</div>';
}

function renderPriorityStores() {
  const activities = selectedActivities();
  const stores = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .filter((store) => store.completed < store.expected)
    .sort((a, b) => a.compliance - b.compliance || a.store.localeCompare(b.store, "es-MX"))
    .slice(0, 8);
  $("#priority-stores").innerHTML = stores.length ? stores.map((store) => `
    <article class="priority-card"><header><span>CeCo ${esc(store.ceco)}</span><span>${percent(store.compliance)}</span></header>
      <strong>${esc(store.store)}</strong><small>${esc(store.dm)}</small>
      <small>${store.expected - store.completed} ${store.expected - store.completed === 1 ? "actividad pendiente" : "actividades pendientes"}</small>
    </article>`).join("") : '<div class="empty-state">Todas las tiendas de la vista están completas.</div>';
}

function renderActivityCards() {
  const stores = filteredStores();
  const visible = state.data.activities.filter((item) => !state.filters.activity || item.name === state.filters.activity);
  $("#activity-cards").innerHTML = visible.length ? visible.map((item, index) => {
    const completed = stores.filter((store) => store.activities[item.name]).length;
    const compliance = stores.length ? completed / stores.length * 100 : 0;
    return `<article class="activity-card">
      <div><header><span class="activity-number">${String(index + 1).padStart(2, "0")}</span>${item.autoDetected ? '<span class="badge pending">Detectada en Forms</span>' : '<span class="badge">Activa</span>'}</header>
        <h3>${esc(item.name)}</h3><p>${esc(item.description)}</p></div>
      <div class="activity-metric"><span>${completed} de ${stores.length} tiendas</span><strong>${percent(compliance)}</strong><div class="track"><span style="--progress:${Math.min(compliance, 100)}%"></span></div></div>
    </article>`;
  }).join("") : '<div class="empty-state">No hay actividades activas para mostrar.</div>';
}

function renderStoreTable() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => ({ ...store, ...completionFor(store, activities) }))
    .sort((a, b) => b.compliance - a.compliance || a.dm.localeCompare(b.dm, "es-MX") || a.store.localeCompare(b.store, "es-MX"));
  const completed = rows.reduce((total, item) => total + item.completed, 0);
  const expected = rows.reduce((total, item) => total + item.expected, 0);
  $("#store-count").textContent = `${rows.length} ${rows.length === 1 ? "tienda" : "tiendas"}`;
  $("#store-summary").textContent = `${completed}/${expected} cumplimientos en la vista`;
  $("#store-table").innerHTML = rows.length ? rows.map((store) => `
    <tr><td><strong>${esc(store.ceco)}</strong></td><td>${esc(store.store)}</td><td>${esc(store.dm)}</td>
      <td><div class="mini-progress"><div class="track"><span style="--progress:${Math.min(store.compliance, 100)}%"></span></div><span>${percent(store.compliance)}</span></div></td>
      <td>${store.completed} / ${store.expected}</td><td>${store.lastUpdate ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(store.lastUpdate)) : "Sin registro"}</td>
      <td>${statusBadge(store.completed, store.expected)}</td></tr>`).join("") : '<tr><td colspan="7"><div class="empty-state">Sin tiendas para la selección actual.</div></td></tr>';
}

function renderEvidenceTable() {
  const rows = filteredSubmissions();
  $("#submission-count").textContent = `${rows.length} ${rows.length === 1 ? "registro" : "registros"}`;
  $("#submission-table").innerHTML = rows.length ? rows.map((item) => {
    const evidence = item.evidenceUrl
      ? `<a class="evidence-link" href="${esc(item.evidenceUrl)}" target="_blank" rel="noopener noreferrer">Abrir evidencia ↗</a>`
      : item.evidenceAvailable ? '<span class="badge">Recibida</span>' : '<span class="badge invalid">Faltante</span>';
    return `<tr><td>${esc(item.timestampDisplay)}</td><td><strong>${esc(item.activity)}</strong></td><td>${esc(item.ceco)}</td><td>${esc(item.store)}</td><td>${esc(item.dm)}</td><td>${evidence}</td><td>${item.valid ? '<span class="badge">Válido</span>' : '<span class="badge invalid">Revisar</span>'}</td></tr>`;
  }).join("") : '<tr><td colspan="7"><div class="empty-state">Sin registros para la selección actual.</div></td></tr>';

  const quality = state.data.quality;
  const cards = [
    ["Respuestas leídas", quality.responsesRead],
    ["Filas por revisar", quality.invalidRows.length],
    ["CeCo sin cruce", quality.unknownCeCos.length],
    ["Duplicados válidos", quality.duplicateValidResponses],
  ];
  $("#quality-strip").innerHTML = cards.map(([label, value]) => `<div class="quality-card"><span>${esc(label)}</span><strong>${number(value)}</strong></div>`).join("");
}

function renderAll() {
  renderExecutivePulse();
  renderKpis();
  renderActivityProgress();
  renderDmRanking();
  renderPriorityStores();
  renderActivityCards();
  renderStoreTable();
  renderEvidenceTable();
  renderDmTeam();
  bindDynamicActions();
}

function bindDynamicActions() {
  $$('[data-dm-focus]').forEach((button) => button.addEventListener('click', () => {
    state.filters.dm = button.dataset.dmFocus;
    state.filters.store = "";
    populateFilters();
    renderAll();
    if (button.dataset.target) location.hash = button.dataset.target;
  }, { once: true }));
}

function populateFilters() {
  const currentDm = state.filters.dm;
  const currentStore = state.filters.store;
  const dms = [...new Set(state.data.stores.map((store) => store.dm))].sort((a, b) => a.localeCompare(b, "es-MX"));
  $("#filter-dm").innerHTML = '<option value="">Todos los DM</option>' + dms.map((dm) => `<option value="${esc(dm)}">${esc(dm)}</option>`).join("");
  $("#filter-dm").value = currentDm;
  const stores = state.data.stores.filter((store) => !currentDm || store.dm === currentDm);
  $("#filter-store").innerHTML = '<option value="">Todas las tiendas</option>' + stores.map((store) => `<option value="${esc(store.ceco)}">${esc(store.ceco)} · ${esc(store.store)}</option>`).join("");
  $("#filter-store").value = stores.some((store) => store.ceco === currentStore) ? currentStore : "";
  state.filters.store = $("#filter-store").value;
  $("#filter-activity").innerHTML = '<option value="">Todas las actividades</option>' + state.data.activities.map((item) => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
  $("#filter-activity").value = state.filters.activity;
}

function routeTo(route) {
  state.route = ROUTES[route] ? route : "resumen";
  $$("[data-view]").forEach((view) => { view.hidden = view.dataset.view !== state.route; });
  $$("[data-route]").forEach((link) => {
    const active = link.dataset.route === state.route;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("#route-title").textContent = ROUTES[state.route][0];
  $("#route-subtitle").textContent = ROUTES[state.route][1];
  document.title = `${ROUTES[state.route][0]} · Sistema de Evidencias OPS`;
  closeMenu();
}

function openMenu() {
  $("#sidebar").classList.add("is-open");
  $("#scrim").hidden = false;
  $("#menu-button").setAttribute("aria-expanded", "true");
}

function closeMenu() {
  $("#sidebar").classList.remove("is-open");
  $("#scrim").hidden = true;
  $("#menu-button").setAttribute("aria-expanded", "false");
}

function exportCsv() {
  const activities = selectedActivities();
  const rows = filteredStores().map((store) => {
    const result = completionFor(store, activities);
    return [store.ceco, store.store, store.dm, result.completed, result.expected, percent(result.compliance)];
  });
  const csv = [["CeCo", "Tienda", "DM", "Realizadas", "Esperadas", "Cumplimiento"], ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = `Sistema_Evidencias_OPS_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function bindEvents() {
  $("#menu-button").addEventListener("click", () => $("#sidebar").classList.contains("is-open") ? closeMenu() : openMenu());
  $("#scrim").addEventListener("click", closeMenu);
  window.addEventListener("hashchange", () => routeTo(location.hash.slice(1)));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => { location.hash = button.dataset.go; }));
  $("#filter-dm").addEventListener("change", (event) => {
    state.filters.dm = event.target.value;
    state.filters.store = "";
    populateFilters();
    renderAll();
  });
  $("#filter-store").addEventListener("change", (event) => { state.filters.store = event.target.value; renderAll(); });
  $("#filter-activity").addEventListener("change", (event) => { state.filters.activity = event.target.value; renderAll(); });
  $("#clear-filters").addEventListener("click", () => {
    state.filters = { dm: "", store: "", activity: "" };
    populateFilters();
    renderAll();
  });
  $("#refresh-button").addEventListener("click", () => loadData(true));
  $("#export-csv").addEventListener("click", exportCsv);
  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    $("#install-button").hidden = false;
  });
  $("#install-button").addEventListener("click", async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    $("#install-button").hidden = true;
  });
}

function updateConnection() {
  const offline = !navigator.onLine;
  $("#offline-banner").hidden = !offline;
  $("#connection-status").innerHTML = `<i></i>${offline ? "Modo sin conexión" : "Datos vigentes"}`;
}

async function loadData(announce = false) {
  const button = $("#refresh-button");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(`./data/dashboard.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`No fue posible cargar los datos (${response.status}).`);
    const payload = await response.json();
    if (!payload.summary || !payload.stores || !payload.activities) throw new Error("El JSON no contiene la estructura esperada.");
    state.data = payload;
    $("#last-updated").textContent = payload.lastUpdatedDisplay;
    populateFilters();
    renderAll();
    $("#error-banner").hidden = true;
    if (announce) $("#connection-status").innerHTML = "<i></i>Actualizado";
  } catch (error) {
    $("#error-banner").textContent = `${error.message} Ejecuta el motor Python para reconstruir data/dashboard.json.`;
    $("#error-banner").hidden = false;
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

async function init() {
  bindEvents();
  updateConnection();
  routeTo(location.hash.slice(1) || "resumen");
  await loadData();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
  }
}

init();
