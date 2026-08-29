#!/usr/bin/env python3
"""Prueba mantenimiento seguro, CMS flexible y persistencia atómica."""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.build_dashboard import build_payload, find_header, load_cms
from scripts.clean_obsolete import existing_obsolete_files
from scripts.io_utils import atomic_output_path, atomic_write_text
from scripts.validate_sources import validate_cms_engine


def test_atomic_writes(temp: Path) -> None:
    target = temp / "resultado.json"
    target.write_text("estable", encoding="utf-8")
    with atomic_output_path(target) as temporary:
        temporary.write_text("actualizado", encoding="utf-8")
    assert target.read_text(encoding="utf-8") == "actualizado"

    try:
        with atomic_output_path(target) as temporary:
            temporary.write_text("incompleto", encoding="utf-8")
            raise RuntimeError("fallo simulado")
    except RuntimeError:
        pass
    else:
        raise AssertionError("El fallo simulado no se propagó")
    assert target.read_text(encoding="utf-8") == "actualizado"
    assert not list(temp.glob(".*.tmp"))

    atomic_write_text(target, "final\n")
    assert target.read_text(encoding="utf-8") == "final\n"


def test_obsolete_detection(temp: Path) -> None:
    project = temp / "limpieza"
    for directory in (project / "data", project / "exports", project / "cms", project / "scripts" / "__pycache__"):
        directory.mkdir(parents=True, exist_ok=True)
    (project / "data" / ".dashboard.json.abc.tmp").write_text("parcial", encoding="utf-8")
    (project / "exports" / "Resumen.pdf.tmp").write_text("parcial", encoding="utf-8")
    (project / "cms" / "~$Sistema.xlsx").write_text("bloqueo", encoding="utf-8")
    (project / "scripts" / "__pycache__" / "motor.pyc").write_bytes(b"cache")
    assert existing_obsolete_files(project) == [
        "cms/~$Sistema.xlsx",
        "data/.dashboard.json.abc.tmp",
        "exports/Resumen.pdf.tmp",
        "scripts/__pycache__/motor.pyc",
    ]


def test_flexible_cms(temp: Path) -> None:
    cms = temp / "cms_editado.xlsx"
    shutil.copy2(ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx", cms)
    workbook = load_workbook(cms)

    activities = workbook["Actividades"]
    header_row, cols = find_header(activities, {
        "orden", "actividad", "descripcion", "fecha inicio", "fecha limite",
        "activo", "evidencia requerida", "prioridad", "estado fecha",
    })
    first = header_row + 1
    activities["A1"] = "CMS actualizado por operación"
    activities["A2"] = "Las notas y celdas auxiliares pueden cambiar sin romper el motor."
    activities.cell(first, cols["descripcion"] + 1, "Descripción actualizada desde CMS")
    activities.cell(first, cols["orden"] + 1, "por definir")
    activities.cell(first, cols["fecha inicio"] + 1, "fecha en revisión")
    activities.cell(first, cols["evidencia requerida"] + 1, "En revisión")
    activities.cell(first, cols["prioridad"] + 1, "Urgente")
    activities.cell(first, cols["estado fecha"] + 1, "Estado informativo manual")

    last_activity_row = max(
        row for row in range(header_row + 1, activities.max_row + 1)
        if activities.cell(row, cols["actividad"] + 1).value
    )
    draft = last_activity_row + 1
    activities.cell(draft, cols["orden"] + 1, "pendiente")
    activities.cell(draft, cols["actividad"] + 1, "Borrador sin publicar")
    activities.cell(draft, cols["fecha inicio"] + 1, "por definir")
    activities.cell(draft, cols["fecha limite"] + 1, "por definir")
    activities.cell(draft, cols["activo"] + 1, "")

    config = workbook["Configuracion"]
    config_header, config_cols = find_header(config, {"clave", "valor"})
    for row in range(config_header + 1, config.max_row + 1):
        key = config.cell(row, config_cols["clave"] + 1).value
        if key == "projectName":
            config.cell(row, config_cols["valor"] + 1, "")
        elif key == "requireEvidence":
            config.cell(row, config_cols["valor"] + 1, "En revisión")
    workbook.save(cms)

    audit = validate_cms_engine(cms)
    assert audit["activities"] == 10
    assert audit["drafts"] >= 1
    assert audit["fallbackOrders"] == 1
    assert audit["manualStatuses"] == 1
    assert audit["customPriorities"] == 1
    assert audit["invalidDates"] == 1
    assert audit["safeDefaults"] >= 3

    loaded, _, cms_settings, _ = load_cms(cms)
    assert len(loaded) == 10
    assert "Borrador sin publicar" not in {item["name"] for item in loaded}
    edited = next(item for item in loaded if item["name"] == "Roll Out")
    assert edited["description"] == "Descripción actualizada desde CMS"
    assert edited["priority"] == "Urgente"
    assert edited["requireEvidence"] is True
    assert edited["startDate"] is None
    assert "projectName" not in cms_settings and "requireEvidence" not in cms_settings

    payload = build_payload(
        ROOT / "cms" / "Sistema de Evidencias OPS.xlsx",
        ROOT / "cms" / "Centro Norte_Directorio.xlsx",
        ROOT / "config" / "settings.json",
        cms,
    )
    assert payload["project"] == "Sistema de Evidencias OPS"
    assert payload["summary"]["activities"] == 10


def main() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        test_atomic_writes(temp)
        test_obsolete_detection(temp)
        test_flexible_cms(temp)
    print("Mantenimiento aprobado · CMS flexible · escritura atómica · borradores seguros")


if __name__ == "__main__":
    main()
