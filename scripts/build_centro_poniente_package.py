#!/usr/bin/env python3
"""Crea un ZIP completo y validado para cargar el proyecto en GitHub."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

from build_dashboard import validate_webp_asset

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "outputs" / "Centro_Poniente_8DM_CMS_Estable.zip"
PONIENTE_DMS = {
    "Adriana Alejandra Tanus Buhler": "assets/dm/adriana-tanus.webp",
    "Andrea Nava Guzman": "assets/dm/andrea-nava.webp",
    "Areli Anahi Lazcano Lezama": "assets/dm/areli-lazcano.webp",
    "Daniel Flores Maldonado": "assets/dm/daniel-flores.webp",
    "Erika Julieta Contreras Aguilera": "assets/dm/erika-contreras.webp",
    "Jose De Jesus Magos Arzaluz": "assets/dm/jose-magos.webp",
    "Juan Jesus Zuñiga Flores": "assets/dm/juan-zuniga.webp",
    "Manuel Alejandro Avila Molina": "assets/dm/manuel-avila.webp",
}


def project_files(output: Path) -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    excluded = {output.resolve()}
    files = []
    for relative in result.stdout.splitlines():
        path = ROOT / relative
        if path.is_file() and path.resolve() not in excluded and "__pycache__" not in path.parts:
            files.append(path)
    return sorted(files, key=lambda path: path.relative_to(ROOT).as_posix())


def validate_poniente() -> None:
    dashboard = json.loads((ROOT / "data" / "dashboard.json").read_text(encoding="utf-8"))
    rows = {item["dm"]: item for item in dashboard.get("dms", []) if item.get("dm") in PONIENTE_DMS}
    if set(rows) != set(PONIENTE_DMS):
        raise RuntimeError("El dashboard no contiene exactamente los ocho DM de Centro Poniente")
    for dm, photo in PONIENTE_DMS.items():
        validate_webp_asset(photo, dm)
        row = rows[dm]
        if row.get("photo") != photo or row.get("photoStatus") != "Disponible":
            raise RuntimeError(f"La fotografía no quedó publicada para {dm}")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Empaqueta el proyecto estable con las fotos DM.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    validate_poniente()
    files = project_files(output)
    manifest = [f"{sha256(path)}  {path.relative_to(ROOT).as_posix()}" for path in files]
    instructions = """# Carga estable · Centro Poniente

1. Extrae este ZIP en la raíz del repositorio conservando las carpetas.
2. Ejecuta: `python -X utf8 scripts/safe_maintenance.py --force`
3. Confirma que GitHub Actions finalice en verde.

El paquete incluye el proyecto completo, el CMS sin exclusiones históricas obsoletas,
la detección automática de WebP y las ocho fotografías de Centro Poniente.
"""
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            relative = path.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(relative, date_time=(2026, 9, 4, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if path.suffix == ".py" else 0o644) << 16
            archive.writestr(info, path.read_bytes(), compresslevel=9)
        archive.writestr("INSTRUCCIONES_CARGA_CENTRO_PONIENTE.md", instructions)
        archive.writestr("MANIFEST_SHA256.txt", "\n".join(manifest) + "\n")
    print(f"ZIP generado · 8/8 fotos detectadas · {len(files)} archivos · {output}")


if __name__ == "__main__":
    main()
