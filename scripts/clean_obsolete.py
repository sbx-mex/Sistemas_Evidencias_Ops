#!/usr/bin/env python3
"""Elimina únicamente archivos heredados reemplazados por el CMS y WebP."""

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
)


def existing_obsolete_files() -> list[str]:
    return [relative for relative in OBSOLETE_FILES if (ROOT / relative).is_file()]


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
        (ROOT / relative).unlink()
        print(f"Eliminado: {relative}")
    if not obsolete:
        print("Limpieza sin cambios: no hay archivos obsoletos conocidos")


if __name__ == "__main__":
    main()
