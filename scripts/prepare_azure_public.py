#!/usr/bin/env python3
"""Prepara únicamente recursos web validados para Azure Static Web Apps."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

try:
    from .safe_maintenance import validate_public_assets
except ImportError:
    from safe_maintenance import validate_public_assets

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = (
    "index.html", "styles.css", "app.js", "data-contract.js", "pdf-export.js",
    "xlsx-export.js", "service-worker.js", "manifest.webmanifest", "staticwebapp.config.json",
    "data/dashboard.json", "exports/Resumen_Evidencias_OPS.xlsx", "exports/Resumen_Evidencias_OPS.pdf",
)


def prepare(root: Path, output: Path) -> dict[str, int]:
    root, output = root.resolve(), output.absolute()
    # No sobrescribe fuentes ni carpetas del usuario; sólo crea una carpeta nueva.
    if output.exists() or output.is_symlink():
        raise ValueError("El destino ya existe; elige una carpeta nueva para el paquete web")
    output = output.resolve()
    if output.resolve() == root or root.is_relative_to(output.resolve()):
        raise ValueError("El destino no puede contener el proyecto")
    if output.resolve().is_relative_to(root) and output.relative_to(root).parts[0] in {
        "cms", "data", "exports", "assets", "scripts", "tests", "config", ".git", ".github",
    }:
        raise ValueError("El destino no puede estar dentro de una carpeta del proyecto")
    resources = validate_public_assets(root)
    config = json.loads((root / "staticwebapp.config.json").read_text(encoding="utf-8"))
    if not any(route.get("route") == "/*" and route.get("allowedRoles") == ["evidencias_ops"]
               for route in config.get("routes", [])):
        raise ValueError("Falta la restricción de acceso evidencias_ops")
    # Mismo contrato para navegador, copia offline y paquete de despliegue.
    subprocess.run([
        "node", "-e", "require(process.argv[1]); OPSDashboard.validate(JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8')));",
        str(root / "data-contract.js"), str(root / "data/dashboard.json"),
    ], check=True, capture_output=True, text=True)
    selected = set(PUBLIC_FILES) | set(resources)
    selected.update(path.relative_to(root).as_posix() for path in (root / "assets").rglob("*") if path.is_file())
    for relative in selected:
        source = root / relative
        if source.is_symlink() or not source.resolve().is_relative_to(root):
            raise ValueError("Recurso fuera del proyecto: " + relative)
        if not source.is_file() or not source.stat().st_size:
            raise ValueError("Recurso ausente o vacío: " + relative)
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="ops-web-", dir=output.parent) as temporary:
        staged = Path(temporary) / "web"
        staged.mkdir()
        for relative in sorted(selected):
            target = staged / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / relative, target)
        validate_public_assets(staged)
        staged.rename(output)
    return {"files": len(selected), "bytes": sum((output / relative).stat().st_size for relative in selected)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "azure-public")
    args = parser.parse_args()
    result = prepare(ROOT, args.output)
    print(f"Paquete Azure validado · {result['files']} archivos · {result['bytes']} bytes · sólo recursos web")


if __name__ == "__main__":
    main()
