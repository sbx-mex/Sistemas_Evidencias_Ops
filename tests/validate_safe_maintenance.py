#!/usr/bin/env python3
"""Pruebas unitarias del orquestador de mantenimiento seguro."""

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import subprocess
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_dashboard as engine
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
        try:
            (root / "config").mkdir()
            settings = root / "config/settings.json"
            settings.write_bytes((ROOT / "config/settings.json").read_bytes())
            (root / "cms").mkdir()
            (root / "cms" / "Corte_Forms_2026-09-17_115657.xlsx").write_bytes(
                (ROOT / "cms" / "Corte_Forms_2026-09-17_115657.xlsx").read_bytes()
            )
            (root / "config" / "cutover.json").write_bytes(
                (ROOT / "config" / "cutover.json").read_bytes()
            )
            current_data = (ROOT / "data/dashboard.json").read_bytes()
            safe.GENERATED[0].write_bytes(current_data)
            safe.GENERATED[1].write_bytes((ROOT / "exports/Resumen_Evidencias_OPS.xlsx").read_bytes())
            safe.GENERATED[2].write_bytes((ROOT / "exports/Resumen_Evidencias_OPS.pdf").read_bytes())
            assert safe.outputs_current(fingerprints)
            changed_fingerprints = dict(fingerprints)
            changed_fingerprints["Sistema_Evidencias_OPS_CMS.xlsx"] = "0" * 64
            assert not safe.outputs_current(changed_fingerprints)
            valid_excel = safe.GENERATED[1].read_bytes()
            safe.GENERATED[1].write_bytes(b"archivo incompleto")
            assert not safe.outputs_current(fingerprints)
            safe.GENERATED[1].write_bytes(valid_excel)
            valid_pdf = safe.GENERATED[2].read_bytes()
            safe.GENERATED[2].write_bytes(b"%PDF-archivo incompleto")
            assert not safe.outputs_current(fingerprints)
            safe.GENERATED[2].write_bytes(valid_pdf)
            assert safe.outputs_current(fingerprints)
            # Cambiar el motor/exportador debe invalidar el resultado aunque
            # ninguno de los tres Excel haya cambiado.
            original_hash = engine.file_sha256
            def changed_exporter(path):
                return "0" * 64 if path.name == "export_excel.py" else original_hash(path)
            with patch.object(engine, "file_sha256", side_effect=changed_exporter):
                assert not safe.outputs_current(fingerprints)
            settings.write_text('{"projectName": "Cambio de configuración"}', encoding="utf-8")
            assert not safe.outputs_current(fingerprints)
            for path in safe.GENERATED:
                path.write_bytes(b"estable")
            try:
                with safe.generated_backup():
                    for path in safe.GENERATED:
                        path.write_bytes(b"incompleto")
                    raise RuntimeError("fallo simulado")
            except RuntimeError:
                pass
            assert all(path.read_bytes() == b"estable" for path in safe.GENERATED)

            # Una reexportación binariamente distinta sólo puede reconciliarse
            # cuando el contrato lógico y la última publicación siguen intactos.
            (root / "config" / "cutover.json").write_bytes(
                (ROOT / "config" / "cutover.json").read_bytes()
            )
            safe.GENERATED[0].write_bytes(current_data)
            config_path = root / "config" / "cutover.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            current_baseline_hash = config["baselineSha256"]
            prior_hash = "0" * 64
            config["baselineSha256"] = prior_hash
            config_path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
            dashboard = json.loads(safe.GENERATED[0].read_text(encoding="utf-8"))
            dashboard["sources"]["baselineSha256"] = prior_hash
            safe.GENERATED[0].write_text(json.dumps(dashboard), encoding="utf-8")
            result = safe.reconcile_cutover_fingerprint()
            assert result["changed"] is True
            assert json.loads(config_path.read_text(encoding="utf-8"))["baselineSha256"] == current_baseline_hash

            # Si la última publicación no confirma la huella anterior, se
            # detiene sin autorizar el cambio.
            config["baselineSha256"] = prior_hash
            config_path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
            dashboard["sources"]["baselineSha256"] = "1" * 64
            safe.GENERATED[0].write_text(json.dumps(dashboard), encoding="utf-8")
            try:
                safe.reconcile_cutover_fingerprint()
            except RuntimeError as error:
                assert "última publicación" in str(error)
            else:
                raise AssertionError("La reconciliación debía rechazar una cadena de custodia rota")

            original_config = config_path.read_bytes()
            try:
                with safe.configuration_backup():
                    config_path.write_text("{}", encoding="utf-8")
                    raise RuntimeError("fallo posterior simulado")
            except RuntimeError:
                pass
            assert config_path.read_bytes() == original_config
        finally:
            safe.ROOT, safe.GENERATED = old_root, old_generated

        old_lock = safe.LOCK
        safe.LOCK = root / "maintenance.lock"
        child_code = (
            "import sys; from pathlib import Path; "
            "sys.path.insert(0, sys.argv[1]); import safe_maintenance as safe; "
            "safe.LOCK = Path(sys.argv[2]); "
            "lock = safe.exclusive_lock(); lock.__enter__(); "
            "import os; os._exit(0)"
        )
        command = [sys.executable, "-B", "-c", child_code, str(ROOT / "scripts"), str(safe.LOCK)]
        try:
            # Un PID guardado, incluso el actual, no representa un bloqueo vivo.
            safe.LOCK.write_text(f"pid={__import__('os').getpid()}\n", encoding="utf-8")
            with safe.exclusive_lock():
                blocked = subprocess.run(command, capture_output=True, text=True, timeout=10)
                assert blocked.returncode != 0 and "bloqueo" in blocked.stderr
            crashed = subprocess.run(command, capture_output=True, text=True, timeout=10)
            assert crashed.returncode == 0, crashed.stderr
            with safe.exclusive_lock():
                pass  # El cierre abrupto del proceso hijo liberó el bloqueo.
        finally:
            safe.LOCK = old_lock

    data = json.loads((ROOT / "data" / "dashboard.json").read_text(encoding="utf-8"))
    assert data["quality"]["stabilityScore"] == "12/12"
    print("Mantenimiento seguro aprobado · CMS completo · rollback · huellas · rendimiento")


if __name__ == "__main__":
    main()
