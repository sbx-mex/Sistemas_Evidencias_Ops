#!/usr/bin/env python3
"""Prueba que el corte conserva avance y acepta únicamente Forms posteriores."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
import sys
import tempfile

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.build_dashboard import build_payload, load_cutover


def create_new_forms(path: Path, rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Respuestas Forms"
    sheet.append([
        "Id", "Hora de inicio", "Hora de finalización", "Correo electrónico",
        "Nombre", "CeCo", "Selecciona la actividad que deseas registrar", "Evidencia del avance",
    ])
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def main() -> None:
    cutover = load_cutover(ROOT / "config" / "cutover.json")
    assert cutover
    with tempfile.TemporaryDirectory() as temp_dir:
        forms = Path(temp_dir) / "Forms_nuevo.xlsx"
        baseline = build_payload(
            ROOT / "cms" / "Sistema de Evidencias OPS.xlsx",
            ROOT / "cms" / "Directorio.xlsx",
            ROOT / "config" / "settings.json",
            ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx",
            baseline_path=cutover["baseline"],
            cutoff=cutover["cutoff"],
            cutover_config_path=ROOT / "config" / "cutover.json",
        )
        activity = baseline["activities"][0]["name"]
        candidate = next(store for store in baseline["stores"] if not store["activities"][activity])
        after = cutover["cutoff"] + timedelta(seconds=1)
        before = cutover["cutoff"] - timedelta(seconds=1)
        evidence = "https://grupovips-my.sharepoint.com/evidencias/prueba.jpg"
        create_new_forms(forms, [
            [1, after, after, "", candidate["store"], candidate["ceco"], activity, evidence],
            [2, after, after, "", candidate["store"], candidate["ceco"], "Roll Out", evidence],
            [3, before, before, "", candidate["store"], candidate["ceco"], activity, evidence],
        ])
        payload = build_payload(
            forms,
            ROOT / "cms" / "Directorio.xlsx",
            ROOT / "config" / "settings.json",
            ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx",
            baseline_path=cutover["baseline"],
            cutoff=cutover["cutoff"],
            cutover_config_path=ROOT / "config" / "cutover.json",
        )
        cut = payload["quality"]["cutover"]
        assert cut == {
            **cut,
            "enabled": True,
            "baselineRowsIncluded": 425,
            "newFormsRowsRead": 3,
            "newFormsRowsIncluded": 2,
            "newFormsRowsRejectedAtOrBeforeCutoff": 1,
        }
        assert payload["summary"]["completedCompletions"] == baseline["summary"]["completedCompletions"] + 1
        assert "Roll Out" not in {item["name"] for item in payload["activities"]}
        assert all(item["activity"] != "Roll Out" for item in payload["submissions"])
        assert payload["sources"]["cutoff"] == "2026-09-17T11:56:57"
    print("Corte histórico aprobado · conserva avance · sólo suma Forms nuevos · CMS filtra actividades ocultas")


if __name__ == "__main__":
    main()
