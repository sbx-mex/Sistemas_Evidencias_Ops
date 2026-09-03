#!/usr/bin/env python3
"""Actualización segura, recuperable y medible de todas las fuentes CMS."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Iterator

from build_dashboard import file_sha256, validate_xlsx
from clean_obsolete import existing_obsolete_files

ROOT = Path(__file__).resolve().parents[1]
CMS = ROOT / "cms"
GENERATED = (
    ROOT / "data" / "dashboard.json",
    ROOT / "exports" / "Resumen_Evidencias_OPS.xlsx",
    ROOT / "exports" / "Resumen_Evidencias_OPS.pdf",
)
LOCK = ROOT / ".safe-maintenance.lock"


def run(*command: str) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


@contextmanager
def exclusive_lock() -> Iterator[None]:
    """Impide dos actualizaciones simultáneas y nunca deja un bloqueo huérfano."""
    if LOCK.exists():
        try:
            owner = int(LOCK.read_text(encoding="utf-8").split("pid=", 1)[1].splitlines()[0])
        except (OSError, ValueError, IndexError):
            owner = -1
        # Autocorrección segura: sólo retira un lock cuyo proceso ya no existe.
        if owner < 1 or not Path(f"/proc/{owner}").exists():
            LOCK.unlink(missing_ok=True)
    try:
        descriptor = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise RuntimeError("Ya existe una actualización segura en ejecución") from error
    try:
        os.write(descriptor, f"pid={os.getpid()}\n".encode())
        os.close(descriptor)
        yield
    finally:
        LOCK.unlink(missing_ok=True)


def cms_sources() -> list[Path]:
    files = sorted(path for path in CMS.glob("*.xlsx") if not path.name.startswith("~$"))
    if not files:
        raise RuntimeError("La carpeta cms no contiene archivos XLSX")
    return files


def validate_all_xlsx(files: list[Path]) -> dict[str, str]:
    """Valida y calcula huellas en paralelo para reducir el tiempo de preflight."""
    def inspect(path: Path) -> tuple[str, str]:
        validate_xlsx(path, f"cms/{path.name}")
        return path.name, file_sha256(path)

    with ThreadPoolExecutor(max_workers=min(4, len(files))) as executor:
        return dict(executor.map(inspect, files))


def outputs_current(fingerprints: dict[str, str]) -> bool:
    if not all(path.is_file() and path.stat().st_size > 0 for path in GENERATED):
        return False
    try:
        data = json.loads(GENERATED[0].read_text(encoding="utf-8"))
        sources = data["sources"]
        saved = {
            "responsesSha256": sources.get("responsesSha256"),
            "directorySha256": sources.get("directorySha256"),
            "cmsSha256": sources.get("cmsSha256"),
        }
    except (OSError, ValueError, KeyError, TypeError):
        return False
    expected = {
        "responsesSha256": fingerprints.get("Sistema de Evidencias OPS.xlsx"),
        "directorySha256": fingerprints.get("Directorio.xlsx"),
        "cmsSha256": fingerprints.get("Sistema_Evidencias_OPS_CMS.xlsx"),
    }
    return all(expected.values()) and saved == expected


@contextmanager
def generated_backup() -> Iterator[None]:
    """Restaura automáticamente los tres resultados si cualquier paso falla."""
    with tempfile.TemporaryDirectory(prefix="evidencias-backup-") as directory:
        backup = Path(directory)
        existing = {}
        for target in GENERATED:
            existing[target] = target.exists()
            if target.exists():
                shutil.copy2(target, backup / target.name)
        try:
            yield
        except BaseException:
            for target in GENERATED:
                saved = backup / target.name
                if existing[target]:
                    shutil.copy2(saved, target)
                else:
                    target.unlink(missing_ok=True)
            raise


def clean_obsolete() -> int:
    obsolete = existing_obsolete_files(ROOT)
    for relative in obsolete:
        path = ROOT / relative
        path.unlink(missing_ok=True)
        if path.parent.name == "__pycache__":
            try:
                path.parent.rmdir()
            except OSError:
                pass
    return len(obsolete)


def rebuild() -> None:
    run(sys.executable, "-X", "utf8", "scripts/build_dashboard.py")
    # Excel y PDF consumen el mismo JSON y pueden generarse simultáneamente.
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(run, sys.executable, "-X", "utf8", "scripts/export_excel.py"),
            executor.submit(run, sys.executable, "-X", "utf8", "scripts/export_pdf.py"),
        ]
        for future in futures:
            future.result()


def main() -> None:
    parser = argparse.ArgumentParser(description="Mantiene cms/ y resultados de forma segura.")
    parser.add_argument("--force", action="store_true", help="Reconstruye aunque las huellas coincidan.")
    parser.add_argument("--check-only", action="store_true", help="Valida sin modificar archivos.")
    args = parser.parse_args()
    started = time.perf_counter()

    with exclusive_lock():
        files = cms_sources()
        before = validate_all_xlsx(files)
        run(sys.executable, "-X", "utf8", "scripts/validate_sources.py")
        if args.check_only:
            print(f"Preflight aprobado · {len(files)} XLSX · sin cambios")
            return

        removed = clean_obsolete()
        current = outputs_current(before)
        with generated_backup():
            if args.force or not current:
                rebuild()
            after = validate_all_xlsx(files)
            if before != after:
                raise RuntimeError("Una fuente CMS cambió durante la actualización; se restauraron los resultados")
            run(sys.executable, "-X", "utf8", "tests/validate_safe_maintenance.py")
            run(sys.executable, "-X", "utf8", "tests/validate_dynamic_forms_schema.py")
            run(sys.executable, "-X", "utf8", "tests/validate_maintenance.py")
            run(sys.executable, "-X", "utf8", "tests/validate_project.py")
            run(sys.executable, "-X", "utf8", "scripts/audit_project.py")
            run(sys.executable, "scripts/clean_obsolete.py", "--check")

    elapsed = time.perf_counter() - started
    action = "reconstruido" if args.force or not current else "sin reconstrucción innecesaria"
    print(f"Actualización segura aprobada · {action} · {removed} obsoletos eliminados · {elapsed:.2f}s")


if __name__ == "__main__":
    main()
