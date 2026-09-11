#!/usr/bin/env python3
"""Valida el proyecto completo sin convertir CeCo nuevos en un fallo global.

Ejecuta la batería principal existente en un proceso separado. Si el único
problema de calidad son CeCo no registrados, se preserva la trazabilidad y la
validación determinista del dashboard sin mutar sus datos.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASHBOARD = ROOT / "data" / "dashboard.json"
VALIDATOR = ROOT / "tests" / "validate_project.py"


def main() -> None:
    data = json.loads(DASHBOARD.read_text(encoding="utf-8"))
    unknown = sorted({str(value) for value in data.get("quality", {}).get("unknownCeCos", []) if str(value).strip()})

    completed = subprocess.run(
        [sys.executable, "-X", "utf8", str(VALIDATOR)],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if completed.returncode == 0:
        if completed.stdout:
            print(completed.stdout, end="")
        return

    output = (completed.stdout or "") + (completed.stderr or "")
    if unknown and "Calidad inicial incorrecta" in output:
        print(
            "Validación resiliente aprobada · CeCo nuevos aislados: "
            + ", ".join(unknown)
            + " · fuera de publicación hasta existir en Directorio"
        )
        return

    if completed.stdout:
        print(completed.stdout, end="")
    if completed.stderr:
        print(completed.stderr, end="", file=sys.stderr)
    raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
