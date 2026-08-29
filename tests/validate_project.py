#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.build_dashboard import safe_evidence_url
from scripts.clean_obsolete import OBSOLETE_FILES

REQUIRED = [
    "index.html", "styles.css", "app.js", "pdf-export.js", "xlsx-export.js", "service-worker.js", "manifest.webmanifest",
    "data/dashboard.json", "exports/Resumen_Evidencias_OPS.xlsx", "exports/Resumen_Evidencias_OPS.pdf", "scripts/build_dashboard.py", "scripts/clean_obsolete.py", "scripts/export_excel.py", "scripts/export_pdf.py", "scripts/prepare_images.py",
    "scripts/audit_project.py", "config/settings.json",
    "cms/Centro Norte_Directorio.xlsx", "cms/Sistema de Evidencias OPS.xlsx",
    "cms/Sistema_Evidencias_OPS_CMS.xlsx", ".github/workflows/build-dashboard.yml", ".nojekyll",
    "assets/icons/icon-64.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
    "assets/icons/icon-64.webp", "assets/icons/icon-192.webp", "assets/icons/icon-512.webp", "assets/icons/ops-logo.webp",
    "assets/director/jorge-alcantar.webp",
    "assets/ui/Damos_Seguimiento.webp", "assets/ui/Un_placer_haber_Ayudado.webp", "tests/build_dynamic_xlsx.js", "tests/build_direct_pdf.js",
]
REQUIRED += [f"assets/dm/{name}.webp" for name in (
    "enrique-cesar", "nancy-carolina", "vanessa-carreno", "veronica-garcia", "yazmin-chabela", "yazmin-garcia"
)]


def fail(message: str) -> None:
    raise AssertionError(message)


passed: list[str] = []


def approve(name: str) -> None:
    passed.append(name)


allowed_hosts = {"grupovips-my.sharepoint.com"}
safe_sample = "https://grupovips-my.sharepoint.com/ruta/imagen.jpg#vista"
if safe_evidence_url(safe_sample, allowed_hosts) != safe_sample:
    fail("El enlace SharePoint autorizado fue rechazado")
for unsafe in ("http://grupovips-my.sharepoint.com/imagen.jpg", "https://usuario@grupovips-my.sharepoint.com/imagen.jpg", "https://example.com/imagen.jpg"):
    if safe_evidence_url(unsafe, allowed_hosts):
        fail("La validación aceptó un enlace de evidencia inseguro")


for relative in REQUIRED:
    if not (ROOT / relative).is_file():
        fail(f"Falta archivo requerido: {relative}")
obsolete_present = [relative for relative in OBSOLETE_FILES if (ROOT / relative).exists()]
if obsolete_present:
    fail("Persisten archivos obsoletos: " + ", ".join(obsolete_present))
approve("01 · Archivos requeridos y limpieza de obsoletos")

data = json.loads((ROOT / "data/dashboard.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "styles.css").read_text(encoding="utf-8")
js = (ROOT / "app.js").read_text(encoding="utf-8")
sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/build-dashboard.yml").read_text(encoding="utf-8")

if data.get("schemaVersion") != 7:
    fail("Versión del contrato JSON incorrecta")
if data.get("project") != "Sistema de Evidencias OPS" or data.get("region") != "Centro Norte":
    fail("Identidad del proyecto incorrecta")
if data.get("sources", {}).get("directorySheet") != "72 T":
    fail("No se utilizó la hoja configurada del directorio")
if data.get("sources", {}).get("cms") != "Sistema_Evidencias_OPS_CMS.xlsx":
    fail("Python no está leyendo el Excel CMS")
if not re.fullmatch(r"\d{2}/\d{2}/\d{4} \d{2}:\d{2}", data.get("lastUpdatedDisplay", "")):
    fail("Última actualización incorrecta")
if data.get("summary", {}).get("dms") != 6 or data.get("summary", {}).get("stores") != 72 or data.get("summary", {}).get("activities") != 7:
    fail("Conteos iniciales incorrectos")
if data.get("calendar", {}).get("active") != 7:
    fail("Las actividades vigentes del CMS no fueron calculadas")

sample = next((store for store in data.get("stores", []) if store.get("ceco") == "38401"), None)
if not sample or sample.get("store") != "Coacalco" or sample.get("dm") != "Enrique Cesar Flores":
    fail("Falló el cruce 38401 → Coacalco → Enrique Cesar")
if sample.get("activities", {}).get("Roll Out") is not True:
    fail("Roll Out no quedó contabilizado")
if len(data.get("dms", [])) != 6 or any(not item.get("photo", "").endswith(".webp") for item in data.get("dms", [])):
    fail("Las seis fotografías WebP no quedaron vinculadas")
if data.get("quality", {}).get("unknownCeCos") or data.get("quality", {}).get("unsafeEvidenceRows"):
    fail("Calidad inicial incorrecta")
if any("email" in row or "submittedBy" in row for row in data.get("submissions", [])):
    fail("El JSON público expone correo o respondente")
published = [row for row in data.get("submissions", []) if row.get("valid")]
if len(published) != 2 or data.get("quality", {}).get("evidenceLinksPublished") != 2:
    fail("Los dos vínculos de evidencia no fueron publicados")
if any(not row.get("evidenceFileName") or not row.get("evidenceUrl") or row.get("evidenceLinkLabel") != f"Link_{row.get('evidenceKey')}" or urlsplit(row["evidenceUrl"]).hostname not in allowed_hosts for row in published):
    fail("Nombre de archivo o vínculo directo inválido")
forms_book = load_workbook(ROOT / "cms" / "Sistema de Evidencias OPS.xlsx", read_only=True, data_only=True)
forms_sheet = forms_book[forms_book.sheetnames[0]]
forms_rows = forms_sheet.iter_rows(values_only=True)
forms_headers = list(next(forms_rows))
evidence_column = forms_headers.index("Evidencia del avance")
excel_links = [row[evidence_column].strip() for row in forms_rows if isinstance(row[evidence_column], str) and row[evidence_column].strip()]
if {row["evidenceUrl"] for row in published} != set(excel_links):
    fail("El vínculo publicado no coincide exactamente con el Excel")
for row in published:
    expected_name = unquote(urlsplit(row["evidenceUrl"]).path.rsplit("/", 1)[-1])
    if row["evidenceFileName"] != expected_name:
        fail("El nombre de archivo no coincide con el vínculo del Excel")
if not data.get("submissions") or data["submissions"][0].get("timestampDisplay") != data.get("lastUpdatedDisplay"):
    fail("La última actualización no coincide con la respuesta más reciente")
if sample.get("ceco") != "38401" or not any(item.get("evidenceKey") == "Roll_Out_38401" for item in data.get("submissions", [])):
    fail("La evidencia Roll_Out_38401 no fue preparada")
approve("02 · CMS, conteos, CeCo y evidencias seguras")

with tempfile.TemporaryDirectory() as temp_dir:
    generated = Path(temp_dir) / "dashboard.json"
    subprocess.run([sys.executable, str(ROOT / "scripts/build_dashboard.py"), "--output", str(generated)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    fresh = json.loads(generated.read_text(encoding="utf-8"))
for payload in (data, fresh):
    payload.pop("generatedAt", None)
if data != fresh:
    fail("data/dashboard.json está desincronizado")
approve("03 · Python sincronizado con la última actualización")

static_excel = load_workbook(ROOT / "exports" / "Resumen_Evidencias_OPS.xlsx", data_only=False)
if static_excel.sheetnames != ["Resumen", "Tiendas", "Actividades"]:
    fail("El Excel Python no contiene las tres vistas ejecutivas")
if any(not str(static_excel[sheet]["A1"].fill.fgColor.rgb).endswith("003B2E") for sheet in static_excel.sheetnames):
    fail("Los títulos del Excel Python no conservan el verde oscuro")
expected_summary_formula = "=IFERROR(A6/C6,0)"
if static_excel["Resumen"]["E6"].value != expected_summary_formula or static_excel["Resumen"]["A6"].number_format != "#,##0" or static_excel["Resumen"]["E6"].number_format != "0.0%" or static_excel["Resumen"]._charts:
    fail("El resumen Excel no conserva fórmula, formato numérico o limpieza visual")
for sheet_name, header_row in (("Resumen", 9), ("Tiendas", 4), ("Actividades", 4)):
    headers = [cell.value for cell in static_excel[sheet_name][header_row]]
    if "Pendientes" in headers:
        fail(f"La hoja {sheet_name} todavía incluye la columna Pendientes")
with tempfile.TemporaryDirectory() as temp_dir:
    dynamic_excel = Path(temp_dir) / "dinamico.xlsx"
    subprocess.run(["node", str(ROOT / "tests" / "build_dynamic_xlsx.js"), str(dynamic_excel)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    dynamic_book = load_workbook(dynamic_excel, data_only=False)
    dm_sheet = dynamic_book["Tiendas"]
    if dynamic_book.sheetnames != ["Resumen", "Tiendas"] or dynamic_book["Resumen"]["B5"].value != 0.014 or dynamic_book["Resumen"]["B5"].number_format != "0.0%":
        fail("El motor XLSX dinámico generó un libro inválido")
    if [cell.value for cell in dm_sheet[4]] != ["CeCo", "Tienda", "Roll Out", "Rack FHW", "QR - Qualtrics", "Mandil Verde", "Realizadas", "Total", "% Avance"]:
        fail("La hoja Tiendas no contiene el detalle por actividad")
    if dm_sheet["G5"].value != "=SUM(C5:F5)" or dm_sheet["H5"].value != "=COUNT(C5:F5)" or dm_sheet["I5"].value != "=IFERROR(G5/H5,0)" or dm_sheet["I5"].number_format != "0.0%":
        fail("Realizadas, Total o porcentaje del DM no son auditables")
    if dm_sheet["A1"].fill.fgColor.rgb != "FF003B2E" or dm_sheet["C5"].fill.fgColor.rgb != "FF1E3932" or dm_sheet["D5"].fill.fgColor.rgb != "FFE9F4EF":
        fail("El contraste del título o los estados 1/0 no es consistente")
approve("04 · XLSX regional y dinámico con formatos congruentes")
with tempfile.TemporaryDirectory() as temp_dir:
    direct_pdf = Path(temp_dir) / "directo.pdf"
    subprocess.run(["node", str(ROOT / "tests" / "build_direct_pdf.js"), str(direct_pdf)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    pdf_bytes = direct_pdf.read_bytes()
    if not pdf_bytes.startswith(b"%PDF-1.4") or not pdf_bytes.rstrip().endswith(b"%%EOF"):
        fail("El motor PDF directo generó un archivo inválido")
regional_pdf = (ROOT / "exports" / "Resumen_Evidencias_OPS.pdf").read_bytes()
if not regional_pdf.startswith(b"%PDF-") or len(regional_pdf) < 20_000:
    fail("El PDF regional Python no fue generado correctamente")
approve("05 · PDF regional Python y descarga directa válidos")

for text in ["Sistema de Evidencia OPS", "Dashboard de Avance de Actividades", "Resumen", "Ranking DM", "Actividades", "Tiendas", "Evidencias", "Actividad", "Tienda", "Link del archivo", "evidence-details", "evidence-filter-dm", "evidence-filter-activity", "evidence-filter-store", "export-image", "export-pdf", "export-excel", "export-modal", "Damos_Seguimiento.webp", "toggle-dates", "evidence-grid", "dm-team", "store-table", "Director Regional", "Jorge Alcantar", "Diseñado por Jorge Alcantar Aguiar"]:
    if text not in html:
        fail(f"Interfaz simplificada incompleta: {text}")
nav_order = [html.index(f'href="#{item}"') for item in ("resumen", "ranking", "actividades", "tiendas", "evidencias")]
section_order = [html.index(f'id="{item}"') for item in ("resumen", "ranking", "actividades", "tiendas", "evidencias")]
if nav_order != sorted(nav_order) or section_order != sorted(section_order):
    fail("Orden de navegación o secciones incorrecto")
if "Última hora del dato actualizado" in html or re.search(r'<details[^>]+id="evidence-details"[^>]+open', html):
    fail("Fecha de corte o panel de soporte no respetan el diseño solicitado")
for forbidden in ["class=\"sidebar\"", "side-nav", "data-route=", "routeTo(", "--sidebar", "guide-steps", "priority-stores", "quality-strip", "Atención prioritaria", "De mayor a menor avance", "Detalle dinámico", "id=\"filter-notice\"", "id=\"activity-context\"", "id=\"evidence-title\"", "id=\"team-title\"", "id=\"stores-title\"", "id=\"store-summary\""]:
    if forbidden in html + js + css:
        fail(f"Elemento lateral obsoleto aún presente: {forbidden}")
approve("06 · Navegación lineal y sin bloques obsoletos")
for text in ["renderSummary", "renderActivities", "renderEvidence", "populateEvidenceFilters", "evidenceFilters", "evidenceLinkLabel", "exportRows", "renderTeam", "renderStores", "beginExport", "finishExport", "exportImage", "exportPdf", "exportExcel", "buildExcelSpec", "renderPdfPages", "exportProfile", "spreadsheetColumn", "Detalle de actividades por tienda", "1 = Realizada · 0 = Pendiente", "acceptExportConfirmation", "Aceptar y descargar", "Valida tu archivo", "Carpeta Descargas", "Cerrar exportación", "export-close", "URL.revokeObjectURL", "REALIZADAS / TOTAL", "% AVANCE", "Un_placer_haber_Ayudado.webp", "noopener noreferrer", "referrerpolicy", "serviceWorker"]:
    if text not in js:
        if text not in html + css:
            fail(f"Funcionalidad faltante: {text}")
for forbidden in ("export-modal-open", "Abrir PDF", "Ver imagen", "Descargar Excel", ">Ver archivo<"):
    if forbidden in html + js + css:
        fail(f"La confirmación final conserva una acción obsoleta: {forbidden}")
if "event.target === event.currentTarget" in js or "URL.revokeObjectURL(state.exportUrl)" not in js or "link.download = exportInfo.filename" not in js:
    fail("La descarga automática, el cierre explícito o la liberación de memoria están incompletos")
approve("07 · Filtros, confirmación y exportaciones del alcance actual")
if "sistema-evidencias-ops-v15" not in sw or "pdf-export.js" not in sw or "xlsx-export.js" not in sw or "Damos_Seguimiento.webp" not in sw or "Resumen_Evidencias_OPS.xlsx" not in sw or "Resumen_Evidencias_OPS.pdf" not in sw or "assets/director/jorge-alcantar.webp" not in sw or ".webp" not in sw or "Sistema_Evidencias_OPS_CMS.xlsx" in sw:
    fail("Caché PWA v15 incompleto")
if "window.print" in js or "Tiendas realizadas" in js:
    fail("La descarga directa o el KPI inicial aún conserva comportamiento obsoleto")
if "Todas las actividades · Ranking regional de mayor a menor avance" in js + (ROOT / "scripts/export_pdf.py").read_text(encoding="utf-8"):
    fail("El PDF aún conserva el subtítulo regional eliminado")
export_pdf_source = (ROOT / "scripts/export_pdf.py").read_text(encoding="utf-8")
if "% PENDIENTE" in js + export_pdf_source or "PÁGINA ${pageIndex" in js or "Página {page_index" in export_pdf_source:
    fail("La exportación conserva porcentaje pendiente o numeración de página")
excel_spec_source = js[js.index("function buildExcelSpec"):js.index("async function exportExcel")]
if '"Pendientes"' in excel_spec_source:
    fail("La exportación Excel dinámica todavía incluye Pendientes")
for required in ("SUM(${activityRange})", "COUNT(${activityRange})", "profile.photo", 'role: "DM"'):
    if required not in js:
        fail(f"Detalle DM incompleto en exportaciones: {required}")
if "guide" in data:
    fail("La guía eliminada todavía se publica en el JSON")
approve("08 · PWA, descarga directa y mensaje final simplificados")
if [item.get("rank") for item in data.get("dms", [])] != list(range(1, 7)):
    fail("Ranking DM inválido")
director = data.get("report", {}).get("regionalDirector", {})
if data.get("report", {}).get("motto") != "JUNTÉMONOS MÁS" or director.get("name") != "Jorge Alcantar" or director.get("role") != "Director Regional" or any("commitmentDateDisplay" not in item for item in data.get("activities", [])):
    fail("Exportación o fechas compromiso no fueron preparadas por Python")
if not any(icon.get("sizes") == "64x64" for icon in manifest.get("icons", [])):
    fail("El nuevo logo no está configurado en todos los tamaños")
approve("09 · Ranking, fotografía DM e identidad ejecutiva")
for text in ["python scripts/clean_obsolete.py --apply", "python scripts/build_dashboard.py", "python scripts/export_excel.py", "python scripts/export_pdf.py", "python scripts/clean_obsolete.py --check", "python tests/validate_project.py", "git add data/dashboard.json exports/Resumen_Evidencias_OPS.xlsx exports/Resumen_Evidencias_OPS.pdf"]:
    if text not in workflow:
        fail(f"Workflow incompleto: {text}")
approve("10 · Workflow completo: limpiar, generar, validar y publicar")

if len(passed) != 10:
    fail(f"Se esperaban 10 validaciones y se ejecutaron {len(passed)}")
print("Validación aprobada · 10/10 controles")
for check in passed:
    print(f"OK {check}")
print("CMS Excel → Python → un JSON consolidado")
print("72 tiendas · 7 actividades vigentes · 6 DM + 1 Director Regional")
print("Roll_Out_38401 → Coacalco → Enrique Cesar · vínculo SharePoint validado")
print("Imagen/PDF: Todos los DM → ranking DM · Un DM → tiendas descendentes")
print("Excel: resumen rápido + detalle + actividades")
