#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "index.html", "styles.css", "app.js", "service-worker.js", "manifest.webmanifest",
    "data/dashboard.json", "scripts/build_dashboard.py", "scripts/prepare_images.py",
    "scripts/audit_project.py", "config/settings.json",
    "cms/Centro Norte_Directorio.xlsx", "cms/Sistema de Evidencias OPS.xlsx",
    "cms/Sistema_Evidencias_OPS_CMS.xlsx", ".github/workflows/build-dashboard.yml", ".nojekyll",
    "assets/icons/icon-64.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
    "assets/icons/icon-64.webp", "assets/icons/icon-192.webp", "assets/icons/icon-512.webp", "assets/icons/ops-logo.webp",
]
REQUIRED += [f"assets/dm/{name}.webp" for name in (
    "enrique-cesar", "nancy-carolina", "vanessa-carreno", "veronica-garcia", "yazmin-chabela", "yazmin-garcia"
)]


def fail(message: str) -> None:
    raise AssertionError(message)


for relative in REQUIRED:
    if not (ROOT / relative).is_file():
        fail(f"Falta archivo requerido: {relative}")

data = json.loads((ROOT / "data/dashboard.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
html = (ROOT / "index.html").read_text(encoding="utf-8")
css = (ROOT / "styles.css").read_text(encoding="utf-8")
js = (ROOT / "app.js").read_text(encoding="utf-8")
sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
workflow = (ROOT / ".github/workflows/build-dashboard.yml").read_text(encoding="utf-8")

if data.get("project") != "Sistema de Evidencias OPS" or data.get("region") != "Centro Norte":
    fail("Identidad del proyecto incorrecta")
if data.get("sources", {}).get("directorySheet") != "72 T":
    fail("No se utilizó la hoja configurada del directorio")
if data.get("sources", {}).get("cms") != "Sistema_Evidencias_OPS_CMS.xlsx":
    fail("Python no está leyendo el Excel CMS")
if data.get("lastUpdatedDisplay") != "28/08/2026 20:32":
    fail("Última actualización incorrecta")
if data.get("summary", {}).get("stores") != 72 or data.get("summary", {}).get("activities") != 7:
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
if data.get("quality", {}).get("unknownCeCos") or not data.get("quality", {}).get("privacyMode"):
    fail("Calidad o privacidad inicial incorrecta")
if any("email" in row or "submittedBy" in row or "evidenceUrl" in row for row in data.get("submissions", [])):
    fail("El JSON público expone información privada")

with tempfile.TemporaryDirectory() as temp_dir:
    generated = Path(temp_dir) / "dashboard.json"
    subprocess.run([sys.executable, str(ROOT / "scripts/build_dashboard.py"), "--output", str(generated)], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    fresh = json.loads(generated.read_text(encoding="utf-8"))
for payload in (data, fresh):
    payload.pop("generatedAt", None)
if data != fresh:
    fail("data/dashboard.json está desincronizado")

for text in ["Lo importante, en una sola vista.", "dm-team", "store-table", "Sistema_Evidencias_OPS_CMS.xlsx"]:
    if text not in html:
        fail(f"Interfaz simplificada incompleta: {text}")
for forbidden in ["class=\"sidebar\"", "side-nav", "data-route=", "routeTo(", "--sidebar"]:
    if forbidden in html + js + css:
        fail(f"Elemento lateral obsoleto aún presente: {forbidden}")
for text in ["renderSummary", "renderActivities", "renderTeam", "renderStores", "exportCsv", "serviceWorker"]:
    if text not in js:
        fail(f"Funcionalidad faltante: {text}")
if "sistema-evidencias-ops-v3" not in sw or ".webp" not in sw or "Sistema_Evidencias_OPS_CMS.xlsx" not in sw:
    fail("Caché PWA v3 incompleto")
if not any(icon.get("sizes") == "64x64" for icon in manifest.get("icons", [])):
    fail("El nuevo logo no está configurado en todos los tamaños")
for text in ["python scripts/build_dashboard.py", "python tests/validate_project.py", "git add data/dashboard.json"]:
    if text not in workflow:
        fail(f"Workflow incompleto: {text}")

print("Validación aprobada · diseño sin barra lateral")
print("CMS Excel → Python → un JSON consolidado")
print("72 tiendas · 7 actividades vigentes · 6 fotografías WebP")
print("CeCo 38401 → Coacalco → Enrique Cesar · privacidad protegida")
