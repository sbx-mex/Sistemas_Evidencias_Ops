#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TEXT_FILES = [ROOT / "index.html", ROOT / "styles.css", ROOT / "app.js", ROOT / "service-worker.js", ROOT / "manifest.webmanifest"]
MAX_FILE_BYTES = 20 * 1024 * 1024

missing = []
oversized = []
issues = []
texts = {source.name: source.read_text(encoding="utf-8") for source in TEXT_FILES}

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
ids = re.findall(r'\bid=["\']([^"\']+)', html)
duplicate_ids = sorted(item for item, count in Counter(ids).items() if count > 1)
missing_dom_targets = sorted(set(re.findall(r'\$\("#([^"\s]+)"\)', js)).difference(ids))
if duplicate_ids:
    issues.append("IDs HTML repetidos: " + ", ".join(duplicate_ids))
if missing_dom_targets:
    issues.append("Controles JavaScript sin destino HTML: " + ", ".join(missing_dom_targets))

for forbidden in ("Guía rápida", "guide-steps", "Atención prioritaria", "priority-stores", "Estado de actualización y calidad de datos", "quality-strip", "De mayor a menor avance", "Detalle dinámico"):
    if forbidden in html:
        issues.append(f"Bloque repetitivo aún visible: {forbidden}")
for forbidden in ("Gerente de Distrito</small>", "ordenadas de mayor a menor"):
    if forbidden in js:
        issues.append(f"Texto redundante aún generado: {forbidden}")

for required in ("Sistema de Evidencia OPS", "Dashboard de Avance de Actividades", "Ranking DM", "Tiendas CN", "Fecha de corte", "export-image", "export-pdf", "toggle-dates"):
    if required not in html:
        issues.append(f"Falta elemento ejecutivo: {required}")
for required in ("Tiendas sin iniciar", "semaphore", "exportImage", "exportPdf", "renderReportSheet", "completedStores", "notStartedStores"):
    if required not in js:
        issues.append(f"Falta comportamiento dinámico: {required}")

data = json.loads((ROOT / "data" / "dashboard.json").read_text(encoding="utf-8"))
ranking = data.get("dms", [])
if data.get("schemaVersion") != 4:
    issues.append("Contrato JSON distinto de la versión 4")
report_meta = data.get("report", {})
if report_meta.get("motto") != "JUNTÉMONOS MÁS" or "Jorge Alcantar" not in report_meta.get("credits", ""):
    issues.append("Metadatos Python de exportación incompletos")
if any("commitmentDateDisplay" not in item for item in data.get("activities", [])):
    issues.append("Fechas compromiso no fueron preparadas por Python")
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

report = {
    "filesReviewed": sum(1 for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts),
    "missingReferences": missing,
    "oversizedFiles": oversized,
    "duplicateHtmlIds": duplicate_ids,
    "missingDomTargets": missing_dom_targets,
    "repetitiveBlocks": 0 if not any("repetitivo" in issue for issue in issues) else 1,
    "rankingSorted": not any("Ranking DM" in issue for issue in issues),
    "vanessaWhiteBackground": round(white_corner_ratio * 100, 1),
    "issues": issues,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if missing or oversized or issues:
    raise SystemExit(1)
