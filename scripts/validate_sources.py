#!/usr/bin/env python3
"""Valida los tres XLSX fuente antes de reconstruir el dashboard."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from openpyxl import load_workbook

from build_dashboard import (
    DEFAULT_CMS,
    DEFAULT_DIRECTORY,
    DEFAULT_RESPONSES,
    DEFAULT_SETTINGS,
    build_payload,
    clean_text,
    file_sha256,
    find_directory_header,
    find_header,
    is_no,
    is_yes,
    key_text,
    load_cms,
    load_settings,
    normalize_ceco,
    validate_xlsx,
)

CMS_SHEETS = {"Actividades", "Gerentes", "Configuracion"}
CMS_CONFIG_KEYS = {
    "projectName", "region", "directorySheet", "onlyOpenStores",
    "requireEvidence", "publishEvidenceLinks", "publishPersonalData",
    "evidenceAllowedHosts", "regionalDirectorName", "regionalDirectorPhoto",
}


def duplicates(values: list[str]) -> list[str]:
    return sorted(value for value, count in Counter(values).items() if count > 1)


def assert_boolean(value: object, label: str) -> None:
    if not (is_yes(value) or is_no(value)):
        raise ValueError(f"{label} debe ser Sí o No: {clean_text(value) or '(vacío)'}")


def validate_cms_engine(path: Path) -> dict[str, int]:
    """Audita estructura, unicidad, catálogos y fórmulas del CMS editable."""
    validate_xlsx(path, "el CMS maestro")
    workbook = load_workbook(path, read_only=False, data_only=False)
    missing_sheets = CMS_SHEETS.difference(workbook.sheetnames)
    if missing_sheets:
        raise ValueError("Faltan hojas CMS: " + ", ".join(sorted(missing_sheets)))

    ws = workbook["Actividades"]
    header_row, cols = find_header(ws, {
        "orden", "actividad", "descripcion", "fecha inicio", "fecha limite",
        "activo", "evidencia requerida", "prioridad", "estado fecha",
    })
    names: list[str] = []
    orders: list[str] = []
    activity_rows = 0
    for row_number in range(header_row + 1, ws.max_row + 1):
        name = clean_text(ws.cell(row_number, cols["actividad"] + 1).value)
        if not name:
            continue
        activity_rows += 1
        names.append(key_text(name))
        order = clean_text(ws.cell(row_number, cols["orden"] + 1).value)
        orders.append(order)
        assert_boolean(ws.cell(row_number, cols["activo"] + 1).value, f"Activo de {name}")
        assert_boolean(
            ws.cell(row_number, cols["evidencia requerida"] + 1).value,
            f"Evidencia requerida de {name}",
        )
        priority = key_text(ws.cell(row_number, cols["prioridad"] + 1).value)
        if priority not in {"alta", "media", "baja"}:
            raise ValueError(f"Prioridad CMS inválida para {name}")
        formula = ws.cell(row_number, cols["estado fecha"] + 1).value
        if not isinstance(formula, str) or not formula.startswith("="):
            raise ValueError(f"Estado fecha debe ser fórmula en Actividades!I{row_number}: {name}")
    if duplicates(names):
        raise ValueError("Actividades CMS duplicadas: " + ", ".join(duplicates(names)))
    if duplicates(orders):
        raise ValueError("Órdenes CMS duplicados: " + ", ".join(duplicates(orders)))

    manager_ws = workbook["Gerentes"]
    manager_header, manager_cols = find_header(manager_ws, {"dm", "nombre corto", "foto webp", "activo"})
    managers: list[str] = []
    for row_number in range(manager_header + 1, manager_ws.max_row + 1):
        dm = clean_text(manager_ws.cell(row_number, manager_cols["dm"] + 1).value)
        if not dm:
            continue
        managers.append(key_text(dm))
        assert_boolean(manager_ws.cell(row_number, manager_cols["activo"] + 1).value, f"Activo de {dm}")
    if duplicates(managers):
        raise ValueError("Gerentes CMS duplicados: " + ", ".join(duplicates(managers)))

    config_ws = workbook["Configuracion"]
    config_header, config_cols = find_header(config_ws, {"clave", "valor"})
    config_keys = [
        clean_text(config_ws.cell(row, config_cols["clave"] + 1).value)
        for row in range(config_header + 1, config_ws.max_row + 1)
        if clean_text(config_ws.cell(row, config_cols["clave"] + 1).value)
    ]
    missing_keys = CMS_CONFIG_KEYS.difference(config_keys)
    if missing_keys or duplicates(config_keys):
        raise ValueError(
            "Configuración CMS inválida · faltan: "
            + (", ".join(sorted(missing_keys)) or "ninguna")
            + " · duplicadas: "
            + (", ".join(duplicates(config_keys)) or "ninguna")
        )
    return {"activities": activity_rows, "managers": len(managers), "settings": len(config_keys)}


def validate_directory_engine(path: Path, cms_path: Path, settings_path: Path) -> dict[str, int | str]:
    """Audita únicamente la hoja operativa configurada; las históricas no alimentan el tablero."""
    _, _, cms_settings, _ = load_cms(cms_path)
    settings = load_settings(settings_path, cms_settings)
    validate_xlsx(path, "el directorio")
    workbook = load_workbook(path, read_only=True, data_only=True)
    sheet_name = clean_text(settings.get("directorySheet"))
    if sheet_name not in workbook.sheetnames:
        raise ValueError(f"La hoja operativa del Directorio no existe: {sheet_name}")
    ws = workbook[sheet_name]
    header_row, headers = find_directory_header(ws)
    cols = {key_text(value): index for index, value in enumerate(headers) if clean_text(value)}
    missing_columns = {"cc", "cc nombre", "region", "estatus", "dm"}.difference(cols)
    if missing_columns:
        raise ValueError("Directorio incompleto: " + ", ".join(sorted(missing_columns)))
    active_cecos: list[str] = []
    missing_dm: list[str] = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        ceco = normalize_ceco(row[cols["cc"]])
        if not ceco:
            continue
        region = clean_text(row[cols["region"]])
        status = key_text(row[cols["estatus"]])
        if settings.get("region") and key_text(region) != key_text(settings["region"]):
            continue
        if settings.get("onlyOpenStores") and status not in {"abierta", "abierto", "activa", "activo"}:
            continue
        active_cecos.append(ceco)
        if not clean_text(row[cols["dm"]]):
            missing_dm.append(ceco)
    if duplicates(active_cecos):
        raise ValueError("CeCo duplicados en la hoja operativa: " + ", ".join(duplicates(active_cecos)))
    if missing_dm:
        raise ValueError("Tiendas abiertas sin DM: " + ", ".join(missing_dm))
    hidden_sheets = sum(sheet.sheet_state != "visible" for sheet in workbook.worksheets)
    return {"stores": len(active_cecos), "sheet": sheet_name, "hiddenSheets": hidden_sheets}


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida integridad, encabezados y cruces de los XLSX fuente.")
    parser.add_argument("--responses", type=Path, default=DEFAULT_RESPONSES)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    args = parser.parse_args()

    cms_audit = validate_cms_engine(args.cms)
    directory_audit = validate_directory_engine(args.directory, args.cms, args.settings)

    payload = build_payload(args.responses, args.directory, args.settings, args.cms)
    quality = payload["quality"]
    schema = quality["responseSchema"]
    conflicting_evidence = {
        key: rows for key, rows in schema.get("evidenceIssues", {}).items()
        if key not in {"generic-evidence-fallback"} and rows
    }
    blocking_issues = {
        "conflictosFilas": schema.get("rowConflicts", []),
        "conflictosEvidencia": conflicting_evidence,
        "conflictosAplicabilidad": schema.get("applicabilityIssues", {}),
        "cecosDesconocidos": quality.get("unknownCeCos", []),
        "vinculosInseguros": quality.get("unsafeEvidenceRows", []),
    }
    if any(blocking_issues.values()):
        raise SystemExit("Fuentes rechazadas: " + json.dumps(blocking_issues, ensure_ascii=False))

    print(
        "Fuentes XLSX aprobadas · "
        f"Forms {quality['responsesRead']} filas · "
        f"{payload['summary']['stores']} tiendas · "
        f"{payload['summary']['activities']} actividades · "
        f"encabezado Forms fila {schema['headerRow']}"
    )
    print(
        "Motores auditados · "
        f"CMS {cms_audit['activities']} actividades / {cms_audit['managers']} DM / {cms_audit['settings']} parámetros · "
        f"Directorio {directory_audit['stores']} tiendas en {directory_audit['sheet']} · "
        f"{directory_audit['hiddenSheets']} hoja histórica fuera del cálculo"
    )
    for label, path in (("Forms", args.responses), ("Directorio", args.directory), ("CMS", args.cms)):
        print(f"{label}: {path.name} · SHA256 {file_sha256(path)[:12]}")


if __name__ == "__main__":
    main()
