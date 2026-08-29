#!/usr/bin/env python3
"""Valida el caso operativo 10 tiendas, 2 N/A y 8 aplicables para Hornos."""

from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.build_dashboard import build_payload

HORNO = "Programacion Hornos Merry - Focaccia"
DM = "Enrique Cesar Flores"
HEADERS = [
    "Id", "Hora de inicio", "Hora de finalización", "Correo electrónico", "Nombre",
    "Selecciona la actividad que deseas registrar", "CeCo",
    "¿Confirmas que realizaste la actividad seleccionada?", "Evidencia del avance",
]


def main() -> None:
    baseline = json.loads((ROOT / "data/dashboard.json").read_text(encoding="utf-8"))
    stores = [store for store in baseline["stores"] if store["dm"] == DM]
    assert len(stores) == 10, f"El caso control requiere 10 tiendas de {DM}; se encontraron {len(stores)}"

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(HEADERS)
    started = datetime(2026, 8, 29, 8, 0)
    for index, store in enumerate(stores):
        answer = "No" if index < 2 else "Sí"
        evidence = "" if answer == "No" else f"https://grupovips-my.sharepoint.com/hornos/{store['ceco']}.jpg"
        sheet.append([
            index + 1, started + timedelta(minutes=index), started + timedelta(minutes=index, seconds=30),
            "", "Prueba automática", HORNO, store["ceco"], answer, evidence,
        ])

    with tempfile.TemporaryDirectory() as temp_dir:
        responses = Path(temp_dir) / "responses.xlsx"
        workbook.save(responses)
        payload = build_payload(
            responses,
            ROOT / "cms" / "Centro Norte_Directorio.xlsx",
            ROOT / "config" / "settings.json",
            ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx",
        )

    horno = next(item for item in payload["activities"] if item["name"] == HORNO)
    enrique = next(item for item in payload["dms"] if item["dm"] == DM)
    enrique_stores = [store for store in payload["stores"] if store["dm"] == DM]
    horno_completed = sum(store["activities"][HORNO] for store in enrique_stores)
    horno_applicable = sum(store["applicableActivities"][HORNO] for store in enrique_stores)

    assert horno["noMeansNotApplicable"] is True
    assert (horno_completed, horno_applicable) == (8, 8)
    assert horno["completedStores"] == 8 and horno["applicableStores"] == 70 and horno["notApplicableStores"] == 2
    assert enrique["completed"] == 8 and enrique["expected"] == 78 and enrique["notApplicable"] == 2
    assert payload["summary"]["expectedCompletions"] == 574
    assert payload["summary"]["completedCompletions"] == 8
    assert payload["summary"]["notApplicableCompletions"] == 2
    assert payload["quality"]["invalidRows"] == []
    assert sum(item["status"] == "No aplica" for item in payload["submissions"]) == 2
    assert all(
        item["noMeansNotApplicable"] is False
        for item in payload["activities"]
        if item["name"] != HORNO
    )
    print("Hornos aprobado · 10 tiendas · 2 no aplican · ideal 8 · cumplimiento 8/8")


if __name__ == "__main__":
    main()
