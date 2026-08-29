#!/usr/bin/env python3
"""Prueba cambios de columnas/filas del Excel exportado por Microsoft Forms."""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.build_dashboard import build_payload, load_responses


BASE = ["Id", "Hora de inicio", "Hora de finalización", "Correo electrónico", "Nombre"]
ACTIVITY = "Selecciona la actividad que deseas registrar"


def save_book(path: Path, headers: list[str], rows: list[list[object]]) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    workbook.save(path)


def timestamps(index: int) -> tuple[datetime, datetime]:
    start = datetime(2026, 8, 29, 10, 0) + timedelta(minutes=index)
    return start, start + timedelta(seconds=30)


def main() -> None:
    allowed = "https://grupovips-my.sharepoint.com/evidencias"
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)

        # Escenario 1: exportación ancha, columnas reordenadas y una por actividad.
        wide = temp / "wide.xlsx"
        start, finish = timestamps(1)
        wide_headers = BASE + ["CeCo", ACTIVITY, "Columna futura", "Evidencia_Lay_Out", "Evidencia_RollOut"]
        save_book(wide, wide_headers, [[1, start, finish, "", "Prueba", "38115", "Roll Out", "x", "", f"{allowed}/rollout.jpg"]])
        rows, schema = load_responses(wide)
        assert rows[0]["evidence"].endswith("rollout.jpg")
        assert rows[0]["evidenceSourceHeader"] == "Evidencia_RollOut"
        assert rows[0]["confirmed"] is True and schema["confirmationHeaders"] == []

        # Escenario 2: formato largo; Forms agrega nuevas respuestas hacia abajo.
        long_book = temp / "long.xlsx"
        long_headers = BASE + ["CeCo", ACTIVITY, "Evidencia del avance"]
        start1, finish1 = timestamps(2)
        start2, finish2 = timestamps(3)
        save_book(long_book, long_headers, [
            [2, start1, finish1, "", "Prueba", "38115", "Roll Out", f"{allowed}/uno.jpg"],
            [3, start2, finish2, "", "Prueba", "38149", "Lay Out", f"{allowed}/dos.jpg"],
        ])
        rows, schema = load_responses(long_book)
        assert len(rows) == 2 and all(row["confirmed"] for row in rows)
        assert schema["evidenceHeaderMap"] == {"Evidencia del avance": "generic"}

        # Escenario 3: encabezados base duplicados; se toma el único valor poblado.
        duplicate = temp / "duplicate.xlsx"
        start, finish = timestamps(4)
        duplicate_headers = BASE + ["CeCo", "CeCo", ACTIVITY, ACTIVITY, "Evidencia_QR_Qualtrics"]
        save_book(duplicate, duplicate_headers, [[4, start, finish, "", "Prueba", "", "38965", "", "QR - Qualtrics", f"{allowed}/qr.jpg"]])
        rows, schema = load_responses(duplicate)
        assert rows[0]["ceco"] == "38965" and rows[0]["activity"] == "QR - Qualtrics"
        assert schema["rowConflicts"] == []

        # Escenario 4: dos evidencias incompatibles no se mezclan ni se adivinan.
        ambiguous = temp / "ambiguous.xlsx"
        start, finish = timestamps(5)
        ambiguous_headers = BASE + ["CeCo", ACTIVITY, "Evidencia_QR_Qualtrics", "Evidencia_Lay_Out"]
        save_book(ambiguous, ambiguous_headers, [[5, start, finish, "", "Prueba", "38115", "Roll Out", f"{allowed}/qr.jpg", f"{allowed}/layout.jpg"]])
        rows, schema = load_responses(ambiguous)
        assert rows[0]["evidence"] == "" and rows[0]["confirmed"] is False
        assert schema["evidenceIssues"]["ambiguous-evidence"] == [2]

        # Escenario 5: una sola evidencia en la columna incorrecta tampoco se reasigna.
        mismatched = temp / "mismatched.xlsx"
        start, finish = timestamps(6)
        mismatched_headers = BASE + ["CeCo", ACTIVITY, "Evidencia_QR_Qualtrics"]
        save_book(mismatched, mismatched_headers, [[6, start, finish, "", "Prueba", "38115", "Roll Out", f"{allowed}/qr.jpg"]])
        rows, schema = load_responses(mismatched)
        assert rows[0]["evidence"] == "" and rows[0]["confirmed"] is False
        assert schema["evidenceIssues"]["mismatched-evidence-column"] == [2]

        # Escenario 6: una actividad nueva queda en historia, pero no se publica hasta activarla en CMS.
        hidden = temp / "hidden.xlsx"
        start, finish = timestamps(7)
        hidden_headers = BASE + ["CeCo", ACTIVITY, "Evidencia_Nueva_Actividad"]
        save_book(hidden, hidden_headers, [[6, start, finish, "", "Prueba", "38115", "Nueva Actividad Forms", f"{allowed}/nueva.jpg"]])
        payload = build_payload(
            hidden,
            ROOT / "cms" / "Centro Norte_Directorio.xlsx",
            ROOT / "config" / "settings.json",
            ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx",
        )
        assert payload["summary"]["activities"] == 8
        assert payload["submissions"] == []
        assert payload["quality"]["hiddenActivities"] == ["Nueva Actividad Forms"]
        assert payload["quality"]["hiddenActivityRows"] == [2]

    print("Forms dinámico aprobado · cruce estricto por actividad · CMS controla visibilidad")


if __name__ == "__main__":
    main()
