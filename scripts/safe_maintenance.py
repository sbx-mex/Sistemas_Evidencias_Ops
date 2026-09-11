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

# El mantenimiento debe ser limpio también fuera de GitHub Actions.
sys.dont_write_bytecode = True

from build_dashboard import file_sha256, output_version, validate_xlsx
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
    environment = os.environ.copy()
    environment.update({
        "PYTHONUTF8": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONPYCACHEPREFIX": "/tmp/evidencias-ops-pycache",
    })
    subprocess.run(command, cwd=ROOT, check=True, env=environment)


@contextmanager
def exclusive_lock() -> Iterator[None]:
    """El sistema operativo libera el bloqueo al salir, incluso tras un cierre abrupto.

    El archivo permanece ignorado por Git. No se borra: eliminarlo permitiría
    que otro proceso bloqueara un archivo nuevo mientras el primero sigue activo.
    """
    with os.fdopen(os.open(LOCK, os.O_CREAT | os.O_RDWR, 0o600), "r+b") as handle:
        if os.fstat(handle.fileno()).st_size == 0:
            handle.write(b" ")
            handle.flush()
        handle.seek(0)
        if os.name == "nt":
            import msvcrt
            acquire = lambda: msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            release = lambda: msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            acquire = lambda: fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            release = lambda: fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        try:
            acquire()
        except OSError as error:
            raise RuntimeError("No se pudo adquirir el bloqueo; puede haber otra actualización en ejecución") from error
        try:
            handle.seek(0)
            handle.write(f"pid={os.getpid()}\n".encode())
            handle.truncate()
            handle.flush()
            yield
        finally:
            handle.seek(0)
            release()


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
            "settingsSha256": sources.get("settingsSha256"),
        }
    except (OSError, ValueError, KeyError, TypeError):
        return False
    expected = {
        "responsesSha256": fingerprints.get("Sistema de Evidencias OPS.xlsx"),
        "directorySha256": fingerprints.get("Directorio.xlsx"),
        "cmsSha256": fingerprints.get("Sistema_Evidencias_OPS_CMS.xlsx"),
        "settingsSha256": file_sha256(ROOT / "config/settings.json"),
    }
    return bool(all(expected.values()) and saved == expected and data.get("buildVersion") == output_version(expected))


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


def isolate_unknown_cecos() -> list[str]:
    """Reporta CeCo nuevos sin alterar el JSON determinista del motor Python.

    build_dashboard ya excluye de submissions y conteos las respuestas cuyo CeCo
    no cruza con Directorio. La señal se conserva en quality.unknownCeCos para
    diagnóstico y trazabilidad, pero nunca se reescribe dashboard.json después
    del build porque eso rompería la comparación determinista del proyecto.
    """
    dashboard = GENERATED[0]
    data = json.loads(dashboard.read_text(encoding="utf-8"))
    quality = data.get("quality", {})
    isolated = sorted({str(value) for value in quality.get("unknownCeCos", []) if str(value).strip()})
    if isolated:
        print(
            "CeCo aislados sin bloqueo: "
            + ", ".join(isolated)
            + " · fuera de publicación hasta existir en Directorio"
        )
    return isolated


def rebuild() -> None:
    run(sys.executable, "-X", "utf8", "scripts/build_dashboard.py")
    isolate_unknown_cecos()
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
        run(sys.executable, "-X", "utf8", "scripts/validate_sources_resilient.py")
        if args.check_only:
            print(f"Preflight aprobado · {len(files)} XLSX · sin cambios")
            return

        removed = clean_obsolete()
        current = outputs_current(before)
        with generated_backup():
            if args.force or not current:
                rebuild()
            else:
                isolate_unknown_cecos()
            after = validate_all_xlsx(files)
            if before != after:
                raise RuntimeError("Una fuente CMS cambió durante la actualización; se restauraron los resultados")
            run(sys.executable, "-X", "utf8", "tests/validate_safe_maintenance.py")
            run(sys.executable, "-X", "utf8", "tests/validate_dynamic_forms_schema.py")
            run(sys.executable, "-X", "utf8", "tests/validate_maintenance.py")
            run(sys.executable, "-X", "utf8", "scripts/validate_project_resilient.py")
            # Las pruebas y exportadores también pueden dejar residuos si un
            # proceso externo interrumpe una escritura; se limpia antes de auditar.
            removed += clean_obsolete()
            run(sys.executable, "-X", "utf8", "scripts/audit_project.py")
            run(sys.executable, "scripts/clean_obsolete.py", "--check")
            if before != validate_all_xlsx(cms_sources()) or not outputs_current(before):
                raise RuntimeError("Las fuentes o el motor cambiaron durante la validación; se restauraron los resultados")

    elapsed = time.perf_counter() - started
    action = "reconstruido" if args.force or not current else "sin reconstrucción innecesaria"
    print(f"Actualización segura aprobada · {action} · {removed} obsoletos eliminados · {elapsed:.2f}s")


if __name__ == "__main__":
    main()
