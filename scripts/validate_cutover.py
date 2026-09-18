#!/usr/bin/env python3
"""Valida la separación entre avance histórico y Forms reiniciado."""

from __future__ import annotations

import argparse
from pathlib import Path

from build_dashboard import (
    DEFAULT_CMS,
    DEFAULT_CUTOVER,
    DEFAULT_RESPONSES,
    load_cms,
    load_cutover,
    load_responses,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida el corte histórico de Evidencias OPS.")
    parser.add_argument("--cutover", type=Path, default=DEFAULT_CUTOVER)
    parser.add_argument("--responses", type=Path, default=DEFAULT_RESPONSES)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    args = parser.parse_args()

    cutover = load_cutover(args.cutover)
    if not cutover:
        raise SystemExit("No existe config/cutover.json; el motor de corte no está configurado")
    activities, _, _, _ = load_cms(args.cms)
    names = [item["name"] for item in activities]
    historical, _ = load_responses(cutover["baseline"], names)
    current, _ = load_responses(args.responses, names)
    historical_out_of_range = [item["row"] for item in historical if not item["finished"] or item["finished"] > cutover["cutoff"]]
    current_before_cutoff = [item["row"] for item in current if not item["finished"] or item["finished"] <= cutover["cutoff"]]
    if historical_out_of_range:
        raise SystemExit("Base histórica inválida; filas posteriores al corte: " + ", ".join(map(str, historical_out_of_range)))
    print(
        "Corte validado · "
        f"{len(historical)} filas históricas · "
        f"{len(current) - len(current_before_cutoff)} filas nuevas · "
        f"{len(current_before_cutoff)} filas antiguas aisladas · "
        f"{len(names)} actividades CMS visibles"
    )


if __name__ == "__main__":
    main()
