#!/usr/bin/env python3
"""Elimina archivos heredados y residuos técnicos que no deben versionarse."""

from __future__ import annotations

import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Lista cerrada: sin patrones, globs ni directorios recursivos.
OBSOLETE_FILES = (
    "config/actividades.csv",
    "config/gerentes.csv",
    "assets/dm/enrique-cesar.jpeg",
    "assets/dm/nancy-carolina.jpeg",
    "assets/dm/vanessa-carreno.jpeg",
    "assets/dm/veronica-garcia.jpeg",
    "assets/dm/yazmin-chabela.jpeg",
    "assets/dm/yazmin-garcia.jpeg",
    "assets/icons/icon.svg",
    "tests/validate_horno_applicability.py",
)
TRANSIENT_FILE_NAMES = {".DS_Store", "Thumbs.db"}
TRANSIENT_SUFFIXES = {".pyc", ".pyo"}


def transient_files() -> list[str]:
    """Detecta sólo residuos técnicos conocidos y nunca recorre el contenido de .git."""
    found = []
    for path in ROOT.rglob("*"):
        if ".git" in path.parts or not (path.is_file() or path.is_symlink()):
            continue
        if (
            path.name in TRANSIENT_FILE_NAMES
            or path.suffix.casefold() in TRANSIENT_SUFFIXES
            or path.name.endswith(".inspect.ndjson")
        ):
            found.append(path.relative_to(ROOT).as_posix())
    return sorted(found)


def existing_obsolete_files() -> list[str]:
    """Devuelve rutas heredadas exactas y residuos técnicos controlados."""
    exact = [
        relative
        for relative in OBSOLETE_FILES
        if (ROOT / relative).is_file() or (ROOT / relative).is_symlink()
    ]
    return sorted(set(exact + transient_files()))


def main() -> None:
    parser = argparse.ArgumentParser(description="Controla archivos obsoletos conocidos del proyecto.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true", help="Elimina los archivos exactos de la lista cerrada.")
    mode.add_argument("--check", action="store_true", help="Falla si reaparece un archivo obsoleto.")
    args = parser.parse_args()

    obsolete = existing_obsolete_files()
    if args.check:
        if obsolete:
            raise SystemExit("Archivos obsoletos detectados: " + ", ".join(obsolete))
        print("Limpieza aprobada: no hay archivos obsoletos conocidos")
        return

    for relative in obsolete:
        path = ROOT / relative
        parent = path.parent
        path.unlink()
        if parent.name == "__pycache__":
            try:
                parent.rmdir()
            except OSError:
                pass
        print(f"Eliminado: {relative}")
    if not obsolete:
        print("Limpieza sin cambios: no hay archivos obsoletos conocidos")


if __name__ == "__main__":
    main()
