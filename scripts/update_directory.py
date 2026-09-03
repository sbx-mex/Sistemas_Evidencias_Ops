#!/usr/bin/env python3
"""Actualiza el Directorio multirregión y sincroniza los DM del CMS."""

from __future__ import annotations

import argparse
import os
import shutil
import tempfile
from copy import copy
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

try:
    from .build_dashboard import clean_text, find_directory_header, key_text, normalize_ceco, normalize_dm, validate_xlsx
except ImportError:
    from build_dashboard import clean_text, find_directory_header, key_text, normalize_ceco, normalize_dm, validate_xlsx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = ROOT / "cms" / "Directorio.xlsx"
DEFAULT_CMS = ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx"


def atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=f".{target.stem}-", suffix=target.suffix, dir=target.parent, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def directory_people(path: Path) -> tuple[list[dict[str, str]], int, list[str], list[str]]:
    validate_xlsx(path, "el nuevo Directorio")
    workbook = load_workbook(path, read_only=True, data_only=True)
    candidates = []
    for ws in workbook.worksheets:
        try:
            header_row, headers = find_directory_header(ws)
        except ValueError:
            continue
        cols = {key_text(value): index for index, value in enumerate(headers) if clean_text(value)}
        if {"cc", "cc nombre", "region", "dm"}.issubset(cols):
            candidates.append((ws.max_row, ws, header_row, cols))
    if not candidates:
        raise ValueError("El archivo no contiene CC, CC Nombre, Región y DM")
    _, ws, header_row, cols = max(candidates, key=lambda item: item[0])

    stores: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        ceco = normalize_ceco(row[cols["cc"]])
        if not ceco:
            continue
        if ceco in seen:
            raise ValueError(f"CeCo duplicado en el nuevo Directorio: {ceco}")
        seen.add(ceco)
        stores.append({
            "ceco": ceco,
            "store": clean_text(row[cols["cc nombre"]]),
            "region": clean_text(row[cols["region"]]),
            "dm": normalize_dm(row[cols["dm"]]),
        })
    if not stores:
        raise ValueError("El nuevo Directorio no contiene tiendas")
    regions = sorted({item["region"] for item in stores if item["region"]}, key=key_text)
    missing_dm = [item["ceco"] for item in stores if item["dm"] == "DM pendiente"]
    return stores, len(stores), regions, missing_dm


def existing_profiles(workbook) -> dict[str, dict[str, str]]:
    ws = workbook["Gerentes"]
    header_row = next(
        row for row in range(1, min(ws.max_row, 12) + 1)
        if key_text(ws.cell(row, 1).value) == "dm"
    )
    headers = {key_text(ws.cell(header_row, col).value): col for col in range(1, ws.max_column + 1)}
    profiles = {}
    for row in range(header_row + 1, ws.max_row + 1):
        dm = clean_text(ws.cell(row, headers["dm"]).value)
        if dm == "DM pendiente":
            continue
        profiles[key_text(dm)] = {
            "short": clean_text(ws.cell(row, headers.get("nombre corto", 2)).value) or dm,
            "photo": clean_text(ws.cell(row, headers.get("foto webp", 3)).value),
        }
    return profiles


def sync_cms(cms_path: Path, stores: list[dict[str, str]]) -> tuple[int, int]:
    workbook = load_workbook(cms_path)
    profiles = existing_profiles(workbook)
    managers: dict[str, dict[str, str]] = {}
    for store in stores:
        dm = store["dm"]
        if dm == "DM pendiente":
            continue
        item = managers.setdefault(key_text(dm), {"dm": dm, "regions": set()})
        item["regions"].add(store["region"])

    ws = workbook["Gerentes"]
    for merged in list(ws.merged_cells.ranges):
        if merged.min_row <= 2:
            ws.unmerge_cells(str(merged))
    ws.merge_cells("A1:F1")
    ws.merge_cells("A2:F2")
    ws["A1"] = "CMS · Gerentes de Distrito"
    ws["A2"] = "Los DM se sincronizan desde Directorio.xlsx. Foto vacía = pendiente; agrega el WebP en assets/dm/ cuando esté disponible."
    ws["A4"] = "DM"
    ws["B4"] = "Región"
    ws["C4"] = "Nombre corto"
    ws["D4"] = "Foto WebP"
    ws["E4"] = "Estado foto"
    ws["F4"] = "Activo"
    if ws.max_row > 4:
        ws.delete_rows(5, ws.max_row - 4)

    ordered = sorted(managers.values(), key=lambda item: (key_text(sorted(item["regions"], key=key_text)[0]), key_text(item["dm"])))
    for row_number, item in enumerate(ordered, 5):
        profile = profiles.get(key_text(item["dm"]), {})
        photo = profile.get("photo", "")
        ws.append([
            item["dm"], " · ".join(sorted(item["regions"], key=key_text)),
            profile.get("short", item["dm"]), photo,
            "Disponible" if photo else "Pendiente", "Si",
        ])
        for cell in ws[row_number]:
            cell.fill = PatternFill("solid", fgColor="EAF4EF")
            cell.font = Font(name="Aptos", size=10, color="24443A")
            cell.alignment = Alignment(vertical="center")

    dark = PatternFill("solid", fgColor="183F35")
    green = PatternFill("solid", fgColor="006241")
    for cell in ws[1]:
        cell.fill = green
        cell.font = Font(name="Aptos Display", size=12, bold=True, color="FFFFFF")
    for cell in ws[4]:
        cell.fill = dark
        cell.font = Font(name="Aptos", size=10, bold=True, color="FFFFFF")
    ws["A2"].fill = PatternFill("solid", fgColor="E6F2ED")
    ws["A2"].font = Font(name="Aptos", size=10, italic=True, color="36574D")
    ws.row_dimensions[1].height = 30
    ws.row_dimensions[2].height = 30
    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:F{4 + len(ordered)}"
    widths = {"A": 38, "B": 20, "C": 28, "D": 34, "E": 16, "F": 12}
    for column, width in widths.items():
        ws.column_dimensions[column].width = width
    ws.data_validations.dataValidation = []
    active_validation = DataValidation(type="list", formula1='"Si,No"', allow_blank=False)
    photo_validation = DataValidation(type="list", formula1='"Disponible,Pendiente"', allow_blank=False)
    ws.add_data_validation(active_validation)
    ws.add_data_validation(photo_validation)
    active_validation.add(f"F5:F{max(104, 4 + len(ordered))}")
    photo_validation.add(f"E5:E{max(104, 4 + len(ordered))}")
    ws.conditional_formatting.add(
        f"E5:E{4 + len(ordered)}",
        FormulaRule(formula=["E5=\"Pendiente\""], fill=PatternFill("solid", fgColor="FFF1D6")),
    )

    config = workbook["Configuracion"]
    config_header = next(row for row in range(1, min(config.max_row, 12) + 1) if key_text(config.cell(row, 1).value) == "clave")
    config_rows = {clean_text(config.cell(row, 1).value): row for row in range(config_header + 1, config.max_row + 1)}
    changes = {
        "region": ("Todas", "Incluir todas las regiones presentes en Directorio.xlsx"),
        "directorySheet": ("Directorio", "Hoja preferida; Python detecta otra hoja válida si cambia el nombre"),
        "onlyOpenStores": ("No", "Sin columna Estatus, se incluyen todas las tiendas del Directorio"),
    }
    for key, (value, description) in changes.items():
        row = config_rows[key]
        config.cell(row, 2).value = value
        config.cell(row, 3).value = description

    with tempfile.NamedTemporaryFile(prefix=f".{cms_path.stem}-", suffix=".xlsx", dir=cms_path.parent, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        workbook.save(temporary)
        os.replace(temporary, cms_path)
    finally:
        temporary.unlink(missing_ok=True)
    pending = sum(not profiles.get(key, {}).get("photo") for key in managers)
    return len(managers), pending


def main() -> None:
    parser = argparse.ArgumentParser(description="Actualiza Directorio.xlsx y agrupa regiones/DM en el CMS")
    parser.add_argument("source", type=Path, help="Nuevo Directorio.xlsx")
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    args = parser.parse_args()
    stores, store_count, regions, missing_dm = directory_people(args.source)
    atomic_copy(args.source, args.directory)
    managers, pending_photos = sync_cms(args.cms, stores)
    print(f"Directorio actualizado · {store_count} tiendas · {len(regions)} regiones · {managers} DM")
    print(f"Fotos DM · {managers - pending_photos} disponibles · {pending_photos} pendientes")
    if missing_dm:
        print("Asignación DM pendiente · " + ", ".join(missing_dm))


if __name__ == "__main__":
    main()
