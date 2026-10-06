#!/usr/bin/env python3
"""Paquete Azure: integridad, lista web, acceso y fallos sin escribir destino."""
from pathlib import Path
import json
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.prepare_azure_public import prepare, PUBLIC_FILES


def rejects(action):
    try:
        action()
    except (ValueError, RuntimeError):
        return
    raise AssertionError("Se aceptó un paquete incompleto o un destino inseguro")


with tempfile.TemporaryDirectory(prefix="ops-azure-test-") as directory:
    base = Path(directory)
    output = base / "public"
    result = prepare(ROOT, output)
    assert result["files"] > len(PUBLIC_FILES)
    assert all((output / relative).is_file() for relative in PUBLIC_FILES)
    assert not any((output / name).exists() for name in ("cms", "scripts", "tests", "config", ".git", ".github", "requirements.txt"))
    assert (output / "data/dashboard.json").read_bytes() == (ROOT / "data/dashboard.json").read_bytes()
    rejects(lambda: prepare(ROOT, ROOT / "cms" / "nuevo-paquete"))
    rejects(lambda: prepare(ROOT, output))
    # Copia aislada de la web, nunca modifica archivos operativos.
    fixture = base / "source";shutil.copytree(output, fixture)
    (fixture / "app.js").unlink()
    rejects(lambda: prepare(fixture, base / "partial"));assert not (base / "partial").exists()
    shutil.copy2(ROOT / "app.js", fixture / "app.js")
    config = json.loads((fixture / "staticwebapp.config.json").read_text())
    config["routes"][-1]["allowedRoles"] = ["anonymous"]
    (fixture / "staticwebapp.config.json").write_text(json.dumps(config))
    rejects(lambda: prepare(fixture, base / "unrestricted"));assert not (base / "unrestricted").exists()
print("Paquete Azure aprobado · archivos completos · datos idénticos · acceso conservado · internos excluidos · escritura segura")
