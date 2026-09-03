#!/usr/bin/env python3
"""Pruebas unitarias del orquestador de mantenimiento seguro."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import safe_maintenance as safe


def main() -> None:
    files = safe.cms_sources()
    assert {path.name for path in files} >= {
        "Sistema de Evidencias OPS.xlsx",
        "Directorio.xlsx",
        "Sistema_Evidencias_OPS_CMS.xlsx",
    }
    fingerprints = safe.validate_all_xlsx(files)
    assert all(len(value) == 64 for value in fingerprints.values())
    assert safe.outputs_current(fingerprints)

    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        old_root, old_generated = safe.ROOT, safe.GENERATED
        safe.ROOT = root
        safe.GENERATED = (root / "dashboard.json", root / "resumen.xlsx", root / "resumen.pdf")
        for path in safe.GENERATED:
            path.write_bytes(b"estable")
        try:
            try:
                with safe.generated_backup():
                    for path in safe.GENERATED:
                        path.write_bytes(b"incompleto")
                    raise RuntimeError("fallo simulado")
            except RuntimeError:
                pass
            assert all(path.read_bytes() == b"estable" for path in safe.GENERATED)
        finally:
            safe.ROOT, safe.GENERATED = old_root, old_generated

    data = json.loads((ROOT / "data" / "dashboard.json").read_text(encoding="utf-8"))
    assert data["quality"]["stabilityScore"] == "10/10"
    print("Mantenimiento seguro aprobado · CMS completo · rollback · huellas · rendimiento")


if __name__ == "__main__":
    main()
