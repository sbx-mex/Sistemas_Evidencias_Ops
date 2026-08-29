#!/usr/bin/env python3
"""Prueba cambios de columnas/filas del Excel exportado por Microsoft Forms."""

from __future__ import annotations

import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

from openpyxl import Workbook, load_workbook

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
        long_headers = BASE + ["CeCo", ACTIVITY, "¿Confirmas que realizaste la actividad seleccionada?", "Evidencia del avance"]
        start1, finish1 = timestamps(2)
        start2, finish2 = timestamps(3)
        save_book(long_book, long_headers, [
            [2, start1, finish1, "", "Prueba", "38115", "Roll Out", "No", f"{allowed}/uno.jpg"],
            [3, start2, finish2, "", "Prueba", "38149", "Lay Out", "Sí", f"{allowed}/dos.jpg"],
        ])
        rows, schema = load_responses(long_book)
        assert len(rows) == 2 and all(row["confirmed"] for row in rows)
        assert all(row["explicitNo"] is False and row["confirmedAnswer"] == "Sí" for row in rows)
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
        assert rows[0]["evidence"] == "" and rows[0]["confirmed"] is True
        assert schema["evidenceIssues"]["ambiguous-evidence"] == [2]

        # Escenario 5: una sola evidencia en la columna incorrecta tampoco se reasigna.
        mismatched = temp / "mismatched.xlsx"
        start, finish = timestamps(6)
        mismatched_headers = BASE + ["CeCo", ACTIVITY, "Evidencia_QR_Qualtrics"]
        save_book(mismatched, mismatched_headers, [[6, start, finish, "", "Prueba", "38115", "Roll Out", f"{allowed}/qr.jpg"]])
        rows, schema = load_responses(mismatched)
        assert rows[0]["evidence"] == "" and rows[0]["confirmed"] is True
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

        # Escenario 7: portada previa, encabezado desplazado y campos personales ausentes.
        shifted = temp / "shifted.xlsx"
        workbook = Workbook()
        cover = workbook.active
        cover.title = "Instrucciones"
        cover["A1"] = "Exportación Microsoft Forms"
        data_sheet = workbook.create_sheet("Respuestas")
        data_sheet.append(["Sistema de Evidencias OPS"])
        data_sheet.append([])
        shifted_headers = ["CeCo", ACTIVITY, "Evidencia_Rack_FHW", "Nueva columna"]
        data_sheet.append(shifted_headers)
        data_sheet.append(["38590", "Rack FHW", f"{allowed}/rack.jpg", "futuro"])
        workbook.save(shifted)
        rows, schema = load_responses(shifted)
        assert schema["sheet"] == "Respuestas" and schema["headerRow"] == 3
        assert rows[0]["ceco"] == "38590" and rows[0]["confirmed"] is True
        assert rows[0]["email"] == "" and rows[0]["name"] == ""
        assert rows[0]["id"].startswith("respuesta-")

        # Escenario 8: el orden cambia y los encabezados pueden ser aproximados
        # o únicamente el nombre de la actividad. El CMS aporta el catálogo válido.
        flexible = temp / "flexible.xlsx"
        start1, finish1 = timestamps(8)
        start2, finish2 = timestamps(9)
        flexible_headers = [
            "Columna nueva", "Fotografia SM", "CeCo", ACTIVITY,
            "Evidencia_Programacion_Horno_Merry_Focaccia", "Hora de finalización",
        ]
        save_book(flexible, flexible_headers, [
            ["x", "", "38333", "Programacion Hornos Merry - Focaccia", f"{allowed}/horno.jpg", finish1],
            ["x", f"{allowed}/foto.jpg", "38115", "Fotografia - SM", "", finish2],
        ])
        activity_names = [
            "Roll Out", "Programacion Hornos Merry - Focaccia", "Rack FHW",
            "QR - Qualtrics", "Max & Min", "Fotografia - SM", "Mandil Verde", "Lay Out",
        ]
        rows, schema = load_responses(flexible, activity_names)
        assert [row["activity"] for row in rows] == [
            "Programacion Hornos Merry - Focaccia", "Fotografia - SM",
        ]
        assert rows[0]["evidence"].endswith("horno.jpg")
        assert rows[1]["evidence"].endswith("foto.jpg")
        assert schema["evidenceHeaderMatch"]["Evidencia_Programacion_Horno_Merry_Focaccia"] == "similar"
        assert schema["evidenceHeaderMatch"]["Fotografia SM"] == "exact"
        assert schema["evidenceIssues"] == {}

        # Escenario 9: cambiar el orden editorial del CMS sólo cambia la
        # presentación; el cumplimiento continúa cruzándose por nombre.
        reordered_cms = temp / "cms_reordered.xlsx"
        cms_book = load_workbook(ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx")
        activity_sheet = cms_book["Actividades"]
        for row_number in range(5, activity_sheet.max_row + 1):
            if activity_sheet.cell(row_number, 2).value and activity_sheet.cell(row_number, 1).value is not None:
                activity_sheet.cell(row_number, 1).value = 100 - int(activity_sheet.cell(row_number, 1).value)
        cms_book.save(reordered_cms)
        payload = build_payload(
            flexible,
            ROOT / "cms" / "Centro Norte_Directorio.xlsx",
            ROOT / "config" / "settings.json",
            reordered_cms,
        )
        assert payload["summary"]["completedCompletions"] == 2
        assert payload["activities"][0]["name"] == "Lay Out"
        stores = {store["ceco"]: store for store in payload["stores"]}
        assert stores["38333"]["activities"]["Programacion Hornos Merry - Focaccia"] is True
        assert stores["38115"]["activities"]["Fotografia - SM"] is True

        # Escenario 10: un archivo renombrado como XLSX se rechaza antes de procesarse.
        damaged = temp / "damaged.xlsx"
        damaged.write_bytes(b"archivo incompleto")
        try:
            load_responses(damaged)
        except ValueError as error:
            assert "dañado" in str(error)
        else:
            raise AssertionError("El XLSX dañado no fue rechazado")

        # Escenario 11: Forms puede quedar sólo con encabezados después de limpiar filas.
        empty = temp / "empty.xlsx"
        save_book(empty, ["CeCo", ACTIVITY, "Evidencia_RollOut"], [])
        payload = build_payload(
            empty,
            ROOT / "cms" / "Centro Norte_Directorio.xlsx",
            ROOT / "config" / "settings.json",
            ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx",
        )
        assert payload["quality"]["responsesRead"] == 0
        assert payload["summary"]["completedCompletions"] == 0
        assert payload["submissions"] == []

    print("Forms dinámico aprobado · encabezados desplazables · cruce estricto · CMS controla visibilidad")


if __name__ == "__main__":
    main()
