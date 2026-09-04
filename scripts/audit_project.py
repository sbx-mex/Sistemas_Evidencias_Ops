#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

from PIL import Image

# La auditoría no debe crear residuos que después ella misma reporte.
sys.dont_write_bytecode = True

from build_dashboard import STABILITY_CONTROLS, compact_key, file_sha256, short_dm_name, validate_xlsx
from clean_obsolete import existing_obsolete_files

ROOT = Path(__file__).resolve().parents[1]
TEXT_FILES = [ROOT / "index.html", ROOT / "styles.css", ROOT / "app.js", ROOT / "pdf-export.js", ROOT / "xlsx-export.js", ROOT / "service-worker.js", ROOT / "manifest.webmanifest"]
MAX_FILE_BYTES = 20 * 1024 * 1024

missing = []
oversized = []
issues = []
obsolete_files = existing_obsolete_files()
texts = {source.name: source.read_text(encoding="utf-8") for source in TEXT_FILES}
workflow = (ROOT / ".github" / "workflows" / "build-dashboard.yml").read_text(encoding="utf-8")
css = texts["styles.css"]
build_engine = (ROOT / "scripts" / "build_dashboard.py").read_text(encoding="utf-8")
dynamic_schema_test = (ROOT / "tests" / "validate_dynamic_forms_schema.py").read_text(encoding="utf-8")

for source in TEXT_FILES:
    for reference in re.findall(r"(?:src|href)[=:]\s*[\"'](\./[^\"'#?]+)", texts[source.name]):
        if "${" in reference:
            continue
        target = ROOT / unquote(reference.removeprefix("./"))
        if not target.exists():
            missing.append({"source": source.name, "target": reference})

for path in ROOT.rglob("*"):
    if path.is_file() and ".git" not in path.parts and path.stat().st_size > MAX_FILE_BYTES:
        oversized.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size})

html = texts["index.html"]
js = texts["app.js"]
xlsx_engine = texts["xlsx-export.js"]
python_excel = (ROOT / "scripts" / "export_excel.py").read_text(encoding="utf-8")
ids = re.findall(r'\bid=["\']([^"\']+)', html)
duplicate_ids = sorted(item for item, count in Counter(ids).items() if count > 1)
missing_dom_targets = sorted(set(re.findall(r'\$\("#([^"\s]+)"\)', js)).difference(ids))
if duplicate_ids:
    issues.append("IDs HTML repetidos: " + ", ".join(duplicate_ids))
if missing_dom_targets:
    issues.append("Controles JavaScript sin destino HTML: " + ", ".join(missing_dom_targets))
if obsolete_files:
    issues.append("Archivos obsoletos conocidos: " + ", ".join(obsolete_files))

for forbidden in ("Guía rápida", "guide-steps", "Atención prioritaria", "priority-stores", "Estado de actualización y calidad de datos", "quality-strip", "De mayor a menor avance", "Detalle dinámico"):
    if forbidden in html:
        issues.append(f"Bloque repetitivo aún visible: {forbidden}")
for removed_campaign_copy in ("JUNTÉMONOS MÁS", "Verificamos juntos cada detalle de campaña.", "Sistema de verificación"):
    if removed_campaign_copy in html:
        issues.append(f"El diseño conserva texto de campaña solicitado para retirar: {removed_campaign_copy}")
if "Fall 26 · Cada detalle cuenta" in html:
    issues.append("El pie conserva el mensaje de campaña solicitado para retirar")
for forbidden in ("Gerente de Distrito</small>",):
    if forbidden in js:
        issues.append(f"Texto redundante aún generado: {forbidden}")

for required in ("Sistema de Evidencia OPS", "Dashboard de Avance de Actividades", "Resumen", "RD's Centro's", "Directores Regionales · Centro's", "Toca una foto para filtrar", "Ranking DM", "Actividades", "Tiendas", "Evidencias", "evidence-grid", "Link del archivo", "evidence-details", "evidence-filter-dm", "evidence-filter-activity", "evidence-filter-store", "Fecha de corte", "Director Starbucks México", "Raúl Sinohe Sierra Santamaria", "raul-sierra-hero.webp", "export-modal", "export-image", "export-pdf", "export-excel", "Damos_Seguimiento.webp", "activity-focus-table", "Diseñado por Jorge Alcántar", "Comentarios y sugerencias", "https://wa.me/message/ENKDSAHYHIGAN1", "header-brand", "campaign-footer", "filter-toolbar", "selected-filter-list", "scope-reset", "section-character", "footer-peanuts", "lucy-fall.webp", "snoopy-fall.webp", "linus-fall.webp", "Peanuts × Starbucks"):
    if required not in html:
        issues.append(f"Falta elemento ejecutivo: {required}")
for required in (".activity-table-shell { overflow-x: clip", ".activity-focus-table { width: 100%; min-width: 0; table-layout: fixed", ".activity-focus-table { display: table", ".activity-focus-table .activity-focus-row { display: table-row", ".activity-focus-table .activity-focus-row td { display: table-cell"):
    if required not in css:
        issues.append(f"Actividades no está adaptada a móvil: {required}")
if re.search(r"\.activity-focus-table\s*\{[^}]*min-width:\s*(?:8\d\d|9\d\d|\d{4,})px", css):
    issues.append("Actividades conserva un ancho mínimo que provoca desplazamiento horizontal")
for required in ("--fall-orange", "--fall-gold", ".section-character", "body > footer.campaign-footer", ".footer-peanuts", "thead { background: #2d2630"):
    if required not in css:
        issues.append(f"El tema Fall 26 no llega a todo el sistema: {required}")
for required in ("renderFilterToolbar", "filterDisplayValue", "data-remove-filter", "focusDynamicCard", 'event.key !== "Escape"', 'aria-pressed="${state.filters.dm === dm.dm}"'):
    if required not in js:
        issues.append(f"Control de navegación incompleto: {required}")
for required in (".filter-toolbar", ".filter-chip", ".filters label.has-value", 'main[aria-busy="true"]', ".organization-copy em"):
    if required not in css:
        issues.append(f"Control visual incompleto: {required}")
if 'aria-busy="true"' not in html or "Ver tiendas" not in html or "Restablecer" not in html:
    issues.append("Accesos rápidos o estado de carga incompletos")
for required in (
    "active_activity_catalog",
    "canonical_cms_activity",
    "ensure_source_stability",
    "normalize_allowed_hosts",
    "Una fila ajena o inactiva no modifica ni los conteos ni la fecha de corte",
    "latest_submission_by_pair",
    "STABILITY_CONTROLS",
):
    if required not in build_engine:
        issues.append(f"El motor no conserva el control exclusivo del CMS: {required}")
for required in (
    "dos actividades fuera del catálogo activo CMS",
    'hiddenActivities"] == ["Nueva Actividad Forms", "Roll Out"]',
    'lastUpdated"] is None',
    "Evidencia_RollOut",
    'duplicateValidResponses"] == 1',
):
    if required not in dynamic_schema_test:
        issues.append(f"Falta prueba de aislamiento CMS: {required}")
store_table_html = html[html.index('<tbody id="store-table"'):]
store_renderer = js[js.index("function renderStores"):js.index("function syncFilterUrl")]
if "<th>DM</th>" in html or "esc(store.dm)" in store_renderer or 'colspan="7"' in store_renderer:
    issues.append("La tabla Tiendas todavía muestra la columna DM")
for required in ("semaphore", "renderEvidence", "populateEvidenceFilters", "evidenceFilters", "evidenceLinkLabel", "exportRows", "syncFilterUrl", "clearDashboardFilters", "beginExport", "finishExport", "exportImage", "exportPdf", "exportExcel", "buildExcelSpec", "renderPdfPages", "exportProfile", "exportActivityLabel", "exportAdvanceLabel", "AVANCE REGIÓN", "icon-192.webp", "spreadsheetColumn", "Detalle de actividades por tienda", "1 = Realizada · 0 = Pendiente", "profile.photo", "acceptExportConfirmation", "Un_placer_haber_Ayudado.webp", "completedStores", "notStartedStores"):
    if required not in js:
        issues.append(f"Falta comportamiento dinámico: {required}")
for required in ("Valida tu archivo", "Carpeta Descargas", "URL.revokeObjectURL(state.exportUrl)"):
    if required not in js:
        issues.append(f"Falta confirmación segura de descarga: {required}")
for obsolete in ("export-modal-open", "Abrir PDF", "Ver imagen", "Descargar Excel", "event.target === event.currentTarget"):
    if obsolete in html + js + texts["styles.css"]:
        issues.append(f"La confirmación conserva una acción obsoleta: {obsolete}")
if "tiendas · ${dm.completed} realizadas" in js:
    issues.append("Ranking DM repite el número de realizadas")
for obsolete_summary in ('id="filter-summary"', "renderFilterSummary", "data-clear-dashboard-filters"):
    if obsolete_summary in html + js + texts["styles.css"]:
        issues.append(f"Resumen redundante todavía visible: {obsolete_summary}")
for redundant_export_text in (
    'fillText(meta.motto, 800, 45)',
    'fillText(meta.motto, 800, 55)',
    '`Actividad · ${exportActivityLabel()}`',
    '`ACTIVIDAD  ${exportActivityLabel()}`',
    '`${director.role} · ${director.name}`',
):
    if redundant_export_text in js:
        issues.append(f"Texto redundante en exportación: {redundant_export_text}")
if js.count("./assets/icons/icon-192.webp") < 2:
    issues.append("PDF e imagen no comparten el icono ejecutivo de alta resolución")
if js.count("context.fillRect(1320,") < 2:
    issues.append("PDF e imagen no comparten el recuadro dinámico de avance")
excel_source = js[js.index("function buildExcelSpec"):js.index("async function exportExcel")]
for required_excel_context in ("const activityLabel = exportActivityLabel()", "exportAdvanceLabel()", "${scope} · ${activityLabel}"):
    if required_excel_context not in excel_source:
        issues.append(f"Excel no conserva el filtro ejecutivo: {required_excel_context}")

data = json.loads((ROOT / "data" / "dashboard.json").read_text(encoding="utf-8"))
source_fingerprints = {}
for source_key, source_path, label in (
    ("responsesSha256", ROOT / "cms" / "Sistema de Evidencias OPS.xlsx", "Forms"),
    ("directorySha256", ROOT / "cms" / "Directorio.xlsx", "Directorio"),
    ("cmsSha256", ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx", "CMS"),
):
    try:
        validate_xlsx(source_path, label)
        source_fingerprints[source_key] = file_sha256(source_path)
    except ValueError as error:
        issues.append(str(error))
        continue
    if data.get("sources", {}).get(source_key) != source_fingerprints[source_key]:
        issues.append(f"La fuente {label} cambió sin reconstruir data/dashboard.json")

if not all(token in texts["service-worker.js"] for token in ("sistema-evidencias-ops-v31", "staleWhileRevalidate", "CACHE_PREFIX", 'cache: "no-store"', "skipWaiting", "clients.claim", "CLEAR_ALL_CACHES", "lucy-fall.webp", "snoopy-fall.webp", "linus-fall.webp", "raul-sierra-hero.webp")):
    issues.append("La PWA no fuerza lectura de red ni limpia versiones anteriores")
if any(token not in js for token in ("loadScriptOnce", "loadExportEngine")) or 'src="./pdf-export.js"' in html or 'src="./xlsx-export.js"' in html:
    issues.append("Los motores de exportación no se cargan bajo demanda")
if "Date.now()" in js[js.index("async function loadData"):js.index("async function refreshApplicationData")]:
    issues.append("La consulta de datos crea claves de caché distintas en cada carga")
if not all(token in workflow for token in ("set -euo pipefail", "git diff --cached --quiet", "git ls-files --error-unmatch")):
    issues.append("El workflow no publica de forma idempotente")
if "git add -A -- tests/validate_horno_applicability.py" in workflow:
    issues.append("El workflow conserva un pathspec directo obsoleto")
if not all(token in html for token in ("no-cache, no-store, must-revalidate", 'http-equiv="Pragma"', 'http-equiv="Expires"')):
    issues.append("La portada no declara actualización inmediata")
ranking = data.get("dms", [])
if data.get("schemaVersion") != 13:
    issues.append("Contrato JSON distinto de la versión 12")
if len(data.get("regions", [])) < 1 or data.get("summary", {}).get("regions") != len(data.get("regions", [])):
    issues.append("El alcance regional no es auditable")
directory_status = data.get("sources", {}).get("directoryStatus", {})
if directory_status.get("includedStatuses") != ["Abierta"] or any(store.get("status") != "Abierta" for store in data.get("stores", [])):
    issues.append("El filtro CMS de tiendas abiertas no se aplicó")
if not re.fullmatch(r"[0-9a-f]{16}", data.get("buildVersion", "")):
    issues.append("La versión Python para invalidar caché es incorrecta")
response_schema = data.get("quality", {}).get("responseSchema", {})
stability_controls = data.get("quality", {}).get("stabilityControls", {})
if tuple(stability_controls) != STABILITY_CONTROLS or not all(stability_controls.values()) or data.get("quality", {}).get("stabilityScore") != "10/10":
    issues.append("Los 10 controles Python de estabilidad no están activos")
if not response_schema.get("activityHeaders") or not response_schema.get("cecoHeaders") or not response_schema.get("evidenceHeaders"):
    issues.append("No se auditó el esquema dinámico del Excel Forms")
if set(response_schema.get("cecoSourceUsage", {})) != set(response_schema.get("cecoHeaders", [])):
    issues.append("El uso de CeCo/CeCo1 no quedó auditado por columna")
if data.get("quality", {}).get("unusedIgnoredResponseSourceIds"):
    issues.append("La configuración conserva Id de Forms obsoletos")
active_activity_keys = {compact_key(item.get("name")) for item in data.get("activities", [])}
evidence_header_matches = response_schema.get("evidenceHeaderMatch", {})
evidence_header_map = response_schema.get("evidenceHeaderMap", {})
if any(match not in {"exact", "affinity", "generic", "unverified"} for match in evidence_header_matches.values()):
    issues.append("Hay encabezados de evidencia con una relación ambigua o insegura")
if any(
    (match in {"exact", "affinity"} and evidence_header_map.get(header) not in active_activity_keys)
    or (match == "unverified" and evidence_header_map.get(header) in active_activity_keys)
    for header, match in evidence_header_matches.items()
):
    issues.append("La relación entre encabezados de evidencia y actividades CMS es incongruente")
if response_schema.get("rowConflicts") or any(
    key in {"ambiguous-evidence", "ambiguous-matching-evidence", "mismatched-evidence-column", "multiple-evidence-columns"} and rows
    for key, rows in response_schema.get("evidenceIssues", {}).items()
):
    issues.append("El Excel Forms contiene columnas o evidencias ambiguas")
if any(rows for rows in response_schema.get("applicabilityIssues", {}).values()):
    issues.append("El Excel Forms contiene respuestas Sí/No contradictorias")
stores = data.get("stores", [])
activity_names = [item.get("name") for item in data.get("activities", [])]
calculated_exclusions = 0
for store in stores:
    applicability = store.get("applicableActivities", {})
    expected = sum(applicability.get(name, True) is not False for name in activity_names)
    calculated_exclusions += len(activity_names) - expected
    if store.get("expected") != expected or store.get("notApplicable") != len(activity_names) - expected:
        issues.append(f"Aplicabilidad inconsistente en CeCo {store.get('ceco')}")
if data.get("summary", {}).get("notApplicableCompletions") != calculated_exclusions:
    issues.append("La resta implícita de actividades no coincide con las respuestas Sí/No")
report_meta = data.get("report", {})
director = report_meta.get("regionalDirector", {})
if report_meta.get("motto") != "CADA DETALLE CUENTA" or report_meta.get("footerLabel") != "Starbucks México · Operaciones" or director.get("role") != "Director Regional":
    issues.append("Metadatos Python de exportación incompletos")
organization = data.get("organization", {})
if organization.get("nationalDirector", {}).get("name") != "Raúl Sinohe Sierra Santamaria" or organization.get("nationalDirector", {}).get("heroPhoto") != "assets/director/raul-sierra-hero.webp" or len(organization.get("regionalDirectors", [])) != 4 or any(not {"filterValue", "stores", "completed", "expected", "pending", "compliance", "status", "photo"}.issubset(item) or not item.get("photo") or item.get("filterValue") != item.get("region") for item in organization.get("regionalDirectors", [])):
    issues.append("Organigrama CMS incompleto")
if any(text in html for text in ("Organigrama vigente controlado desde el CMS.", "Comparativo regional de mayor a menor avance.", "Vista personalizada", "Filtra, revisa y exporta en un solo flujo", "Lectura rápida del avance seleccionado.")):
    issues.append("La interfaz conserva textos redundantes solicitados para ocultar")
organization_renderer = js[js.index("function renderOrganization"):js.index("function renderSummary")]
if "nationalDirector" in organization_renderer or "<img" not in organization_renderer or "person.role" in organization_renderer or "director-progress" not in organization_renderer or "data-region-focus" not in organization_renderer or "aria-pressed" not in organization_renderer or "avance regional" in organization_renderer:
    issues.append("La sección regional no filtra por fotografía o conserva texto redundante")
for full_name, expected in (("Luis Manuel Neri Saldaña", "Luis Neri"), ("Nancy Carolina Rodriguez Medina", "Nancy Rodriguez"), ("Jose De Jesus Magos Arzaluz", "Jose Magos")):
    if short_dm_name(full_name) != expected:
        issues.append(f"Nombre corto DM incorrecto: {full_name}")
published_evidence = [item for item in data.get("submissions", []) if item.get("valid")]
published_pairs = [(item.get("ceco"), item.get("activity")) for item in published_evidence]
if len(published_pairs) != len(set(published_pairs)):
    issues.append("Hay evidencias publicadas duplicadas para la misma tienda y actividad")
if data.get("summary", {}).get("validResponses") != len(published_evidence):
    issues.append("El resumen no coincide con las evidencias vigentes deduplicadas")
if data.get("quality", {}).get("duplicateValidResponses", 0) < 0:
    issues.append("El contador de respuestas históricas deduplicadas es inválido")
if data.get("quality", {}).get("unsafeEvidenceRows"):
    issues.append("Se detectaron evidencias con vínculo inseguro")
if any(not item.get("evidenceFileName") or not item.get("evidenceUrl") or item.get("evidenceLinkLabel") != f"Link_{item.get('evidenceKey')}" or urlsplit(item["evidenceUrl"]).hostname != "grupovips-my.sharepoint.com" for item in published_evidence):
    issues.append("Falta nombre de archivo o vínculo SharePoint directo validado")
nav_order = [html.index(f'href="#{item}"') for item in ("resumen", "ranking", "actividades", "tiendas", "evidencias")]
section_order = [html.index(f'id="{item}"') for item in ("resumen", "ranking", "actividades", "tiendas", "evidencias")]
if nav_order != sorted(nav_order) or section_order != sorted(section_order):
    issues.append("Navegación y contenido no comparten el mismo orden")
if "Última hora del dato actualizado" in html or re.search(r'<details[^>]+id="evidence-details"[^>]+open', html):
    issues.append("La fecha de corte o el panel de evidencias no están simplificados")
for obsolete in ('id="filter-notice"', 'id="activity-context"', 'id="evidence-title"', 'id="team-title"', 'id="stores-title"', 'id="store-summary"', 'id="active-scope"', 'id="toggle-dates"', 'id="commitment-dates"'):
    if obsolete in html:
        issues.append(f"El layout todavía contiene el bloque eliminado: {obsolete}")
if any(not {"commitmentDateDisplay", "deadlineLabel", "deadlineTone", "focusRank"}.issubset(item) for item in data.get("activities", [])):
    issues.append("Fechas compromiso no fueron preparadas por Python")
focus = data.get("activities", [])
if [item.get("focusRank") for item in focus] != list(range(1, len(focus) + 1)):
    issues.append("El orden de foco por fecha no es consecutivo")
summary_source = js[js.index("function renderSummary"):js.index("function renderActivities")]
team_source = js[js.index("function renderTeam"):js.index("function renderStores")]
if '"Aplican"' in summary_source or "aplican${" in team_source or "renderActiveScope" in js:
    issues.append("La interfaz conserva Aplican/No aplica o la vista redundante")
if [item.get("rank") for item in ranking] != list(range(1, len(ranking) + 1)):
    issues.append("Ranking DM no es consecutivo")
if [item.get("compliance", 0) for item in ranking] != sorted((item.get("compliance", 0) for item in ranking), reverse=True):
    issues.append("Ranking DM no está ordenado de mayor a menor")

photo_path = ROOT / "assets" / "dm" / "vanessa-carreno.webp"
with Image.open(photo_path).convert("RGB") as photo:
    width, height = photo.size
    samples = []
    for x0 in (0, width - 20):
        samples.extend(photo.getpixel((x, y)) for x in range(x0, x0 + 20) for y in range(20))
    white_corner_ratio = sum(min(pixel) >= 235 for pixel in samples) / len(samples)
if white_corner_ratio < 0.9:
    issues.append("La fotografía de Vanessa no conserva un fondo blanco uniforme")

for name in ("Damos_Seguimiento.webp", "Un_placer_haber_Ayudado.webp"):
    with Image.open(ROOT / "assets" / "ui" / name) as visual:
        if visual.size != (768, 512) or visual.format != "WEBP":
            issues.append(f"Recurso de exportación inválido: {name}")
if not (ROOT / "exports" / "Resumen_Evidencias_OPS.xlsx").is_file():
    issues.append("No se generó el resumen XLSX de respaldo")
if not (ROOT / "exports" / "Resumen_Evidencias_OPS.pdf").is_file():
    issues.append("No se generó el PDF regional de respaldo")
if "window.print" in js or "Tiendas realizadas" in js:
    issues.append("La descarga PDF o el KPI inicial conservan comportamiento obsoleto")
for required in ("002E24", "style_decision_column", '"Decisión"', "Mantener estándar", "Priorizar hoy"):
    if required not in python_excel:
        issues.append(f"El Excel Python no conserva la lectura ejecutiva: {required}")
for required in ("FF002E24", "tabColor", 'cellXfs count="12"', "Dar seguimiento"):
    if required not in xlsx_engine + js:
        issues.append(f"El Excel dinámico no conserva el contraste ejecutivo: {required}")

report = {
    "filesReviewed": sum(1 for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts),
    "missingReferences": missing,
    "oversizedFiles": oversized,
    "duplicateHtmlIds": duplicate_ids,
    "missingDomTargets": missing_dom_targets,
    "repetitiveBlocks": 0 if not any("repetitivo" in issue for issue in issues) else 1,
    "rankingSorted": not any("Ranking DM" in issue for issue in issues),
    "vanessaWhiteBackground": round(white_corner_ratio * 100, 1),
    "exportVisuals": 2,
    "directEvidenceLinks": len(published_evidence),
    "sourceFingerprints": {key: value[:12] for key, value in source_fingerprints.items()},
    "xlsxFallback": (ROOT / "exports" / "Resumen_Evidencias_OPS.xlsx").is_file(),
    "pdfFallback": (ROOT / "exports" / "Resumen_Evidencias_OPS.pdf").is_file(),
    "obsoleteFiles": obsolete_files,
    "issues": issues,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if missing or oversized or issues:
    raise SystemExit(1)
