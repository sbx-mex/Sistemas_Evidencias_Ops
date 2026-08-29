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
    "data/dashboard.json", "scripts/build_dashboard.py", "scripts/audit_project.py",
    "config/settings.json", "config/actividades.csv", "config/gerentes.csv",
    "cms/Centro Norte_Directorio.xlsx", "cms/Sistema de Evidencias OPS.xlsx",
    "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png",
    ".github/workflows/build-dashboard.yml", ".nojekyll", "README.md",
    "assets/dm/enrique-cesar.jpeg", "assets/dm/nancy-carolina.jpeg",
    "assets/dm/vanessa-carreno.jpeg", "assets/dm/veronica-garcia.jpeg",
    "assets/dm/yazmin-chabela.jpeg", "assets/dm/yazmin-garcia.jpeg",
]


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

if data.get("project") != "Sistema de Evidencias OPS":
    fail("Nombre de proyecto incorrecto")
if data.get("region") != "Centro Norte":
    fail("Región incorrecta")
if data.get("sources", {}).get("directorySheet") != "72 T":
    fail("No se utilizó la hoja configurada del directorio")
if data.get("lastUpdatedDisplay") != "28/08/2026 20:32":
    fail("La Hora de finalización no alimenta Última actualización")
if data.get("summary", {}).get("stores") != 72:
    fail("Conteo esperado de tiendas abiertas incorrecto")
if data.get("summary", {}).get("activities") != 7:
    fail("Catálogo inicial de actividades incorrecto")
if data.get("summary", {}).get("completedCompletions") != 1:
    fail("La respuesta válida del Forms no fue contabilizada")

sample = next((store for store in data.get("stores", []) if store.get("ceco") == "38401"), None)
if not sample or sample.get("store") != "Coacalco" or sample.get("dm") != "Enrique Cesar Flores":
    fail("El cruce CeCo 38401 → Tienda/DM falló")
if sample.get("activities", {}).get("Roll Out") is not True:
    fail("Roll Out no quedó marcado para el CeCo 38401")

if data.get("quality", {}).get("unknownCeCos"):
    fail("Existen CeCo sin cruce en el archivo inicial")
if not data.get("quality", {}).get("privacyMode"):
    fail("El proyecto inicial debe excluir datos personales y links privados")
if any("email" in row or "submittedBy" in row or "evidenceUrl" in row for row in data.get("submissions", [])):
    fail("El JSON público expone datos personales o vínculos privados")
if len(data.get("dms", [])) != 6 or any(not item.get("photo") for item in data.get("dms", [])):
    fail("Las seis fotografías de DM no quedaron integradas")
if any(item.get("pending") is None or not item.get("status") for item in data.get("dms", [])):
    fail("El motor Python no generó indicadores ejecutivos por DM")
if len(data.get("attention", [])) != 72:
    fail("La cola de atención Python no contiene las tiendas pendientes")

with tempfile.TemporaryDirectory() as temp_dir:
    generated = Path(temp_dir) / "dashboard.json"
    subprocess.run(
        [sys.executable, str(ROOT / "scripts/build_dashboard.py"), "--output", str(generated)],
        cwd=ROOT,
        check=True,
        stdout=subprocess.DEVNULL,
    )
    fresh = json.loads(generated.read_text(encoding="utf-8"))

for payload in (data, fresh):
    payload.pop("generatedAt", None)
if data != fresh:
    fail("data/dashboard.json está desincronizado respecto a los Excel y configuración")

for text in ["Sistema de Evidencias OPS", "Última actualización", "filter-dm", "filter-store", "filter-activity", "dm-team", "pulse-ring"]:
    if text not in html:
        fail(f"Interfaz incompleta: {text}")
for text in ["toolAvailability", "HOME_TOOL_NAMES"]:
    if text in js:
        fail(f"Código ajeno heredado de otro proyecto: {text}")
for text in ["filteredStores", "renderActivityCards", "renderDmTeam", "renderExecutivePulse", "exportCsv", "serviceWorker"]:
    if text not in js:
        fail(f"Funcionalidad faltante: {text}")
if "--green: #006241" not in css or "content-visibility" in css:
    fail("Tema visual o CSS inesperado")
if "sistema-evidencias-ops-v2" not in sw or "data/dashboard.json" not in sw or "assets/dm/enrique-cesar.jpeg" not in sw:
    fail("Service Worker incompleto")
if manifest.get("start_url") != "./" or manifest.get("scope") != "./" or manifest.get("display") != "standalone":
    fail("Manifest no compatible con GitHub Pages")
for text in ["python scripts/build_dashboard.py", "python tests/validate_project.py", "git add data/dashboard.json"]:
    if text not in workflow:
        fail(f"Workflow incompleto: {text}")

print("Validación aprobada")
print("Proyecto: Sistema de Evidencias OPS")
print(f"Tiendas: {data['summary']['stores']} · Actividades: {data['summary']['activities']}")
print(f"Última actualización: {data['lastUpdatedDisplay']}")
print("CeCo 38401 → Coacalco → Enrique Cesar · seis fotografías DM integradas")
print("Privacidad pública protegida · lectura ejecutiva generada por Python")
