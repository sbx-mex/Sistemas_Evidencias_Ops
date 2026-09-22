#!/usr/bin/env python3
"""Actualización segura, recuperable y medible de todas las fuentes CMS."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import hashlib
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

from build_dashboard import file_sha256, load_responses, output_version, parse_datetime, validate_xlsx
from io_utils import atomic_write_text
from clean_obsolete import existing_obsolete_files

ROOT = Path(__file__).resolve().parents[1]
CMS = ROOT / "cms"
GENERATED = (
    ROOT / "data" / "dashboard.json",
    ROOT / "exports" / "Resumen_Evidencias_OPS.xlsx",
    ROOT / "exports" / "Resumen_Evidencias_OPS.pdf",
)
LOCK = ROOT / ".safe-maintenance.lock"
REQUIRED_VALIDATORS = (
    "tests/validate_safe_maintenance.py",
    "tests/validate_dynamic_forms_schema.py",
    "tests/validate_cutover.py",
    "tests/validate_maintenance.py",
    "tests/validate_project.py",
    "scripts/audit_project.py",
)
BASELINE_CONTRACT_VERSION = 1


def run(*command: str) -> None:
    environment = os.environ.copy()
    environment.update({
        "PYTHONUTF8": "1",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONPYCACHEPREFIX": "/tmp/evidencias-ops-pycache",
    })
    subprocess.run(command, cwd=ROOT, check=True, env=environment)


def validate_required_validators() -> None:
    """Falla antes de modificar datos si falta una prueba declarada por Python."""
    missing = [relative for relative in REQUIRED_VALIDATORS if not (ROOT / relative).is_file()]
    if missing:
        raise RuntimeError("Faltan validadores requeridos: " + ", ".join(missing))


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


def baseline_contract(path: Path, cutoff_value: object) -> dict[str, object]:
    """Resume el contenido lógico de la base, sin depender del empaquetado XLSX.

    La huella semántica cambia ante cualquier modificación de filas, fechas,
    CeCo, actividad o evidencia, pero permanece estable si Excel sólo vuelve a
    empaquetar el mismo libro con metadatos ZIP distintos.
    """
    cutoff = parse_datetime(cutoff_value)
    if cutoff is None:
        raise RuntimeError("El corte histórico no contiene una fecha cutoff válida")
    responses, schema = load_responses(path)
    schema_issues = {
        "conflictosFilas": schema.get("rowConflicts", []),
        "conflictosEvidencia": schema.get("evidenceIssues", {}),
        "conflictosAplicabilidad": schema.get("applicabilityIssues", {}),
        "conflictosEncuesta": schema.get("surveyIssues", {}),
    }
    if any(schema_issues.values()):
        raise RuntimeError(
            "La base histórica modificada contiene conflictos: "
            + json.dumps(schema_issues, ensure_ascii=False, sort_keys=True)
        )
    missing_finished = [item["row"] for item in responses if item.get("finished") is None]
    after_cutoff = [
        item["row"] for item in responses
        if item.get("finished") is not None and item["finished"] > cutoff
    ]
    source_ids = [str(item.get("sourceId") or "").strip() for item in responses]
    if missing_finished or after_cutoff or any(not value for value in source_ids):
        raise RuntimeError(
            "La base histórica modificada viola el corte: "
            f"sin fecha={missing_finished[:10]}, posteriores={after_cutoff[:10]}, Id vacío={source_ids.count('')}"
        )
    if len(source_ids) != len(set(source_ids)):
        raise RuntimeError("La base histórica modificada contiene Id de Forms duplicados")

    logical_rows = []
    for item in responses:
        logical_rows.append({
            "sourceId": str(item.get("sourceId") or ""),
            "started": item["started"].isoformat(timespec="seconds") if item.get("started") else None,
            "finished": item["finished"].isoformat(timespec="seconds"),
            "email": item.get("email") or "",
            "name": item.get("name") or "",
            "activity": item.get("activity") or "",
            "ceco": item.get("ceco") or "",
            "blenderJars": item.get("blenderJars") or "",
            "coldFoamJars": item.get("coldFoamJars") or "",
            "confirmedAnswer": item.get("confirmedAnswer") or "",
            "applicabilityAnswer": item.get("applicabilityAnswer") or "",
            "surveyAnswers": item.get("surveyAnswers") or {},
            "evidence": item.get("evidence") or "",
            "evidenceSourceHeader": item.get("evidenceSourceHeader") or "",
        })
    encoded = json.dumps(
        logical_rows, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return {
        "version": BASELINE_CONTRACT_VERSION,
        "rows": len(logical_rows),
        "contentSha256": hashlib.sha256(encoded).hexdigest(),
        "maxFinished": max(item["finished"] for item in logical_rows) if logical_rows else None,
    }


def reconcile_cutover_fingerprint() -> dict[str, object]:
    """Actualiza sólo una huella binaria cuyo contenido lógico sigue intacto.

    La huella anterior también debe coincidir con la última publicación. Esto
    evita convertir una edición no autorizada en una nueva base válida.
    """
    config_path = ROOT / "config" / "cutover.json"
    if not config_path.is_file():
        return {"changed": False, "enabled": False}
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if config.get("enabled") is False:
        return {"changed": False, "enabled": False}
    baseline_value = str(config.get("baseline") or "").strip()
    if not baseline_value:
        raise RuntimeError("config/cutover.json no contiene baseline")
    baseline = Path(baseline_value)
    if not baseline.is_absolute():
        baseline = ROOT / baseline
    if not baseline.is_file():
        raise RuntimeError(f"No existe la base histórica configurada: {baseline}")

    contract = baseline_contract(baseline, config.get("cutoff"))
    expected_contract = {
        "version": config.get("baselineContractVersion"),
        "rows": config.get("baselineRows"),
        "contentSha256": str(config.get("baselineContentSha256") or "").casefold(),
    }
    actual_contract = {
        "version": contract["version"],
        "rows": contract["rows"],
        "contentSha256": contract["contentSha256"],
    }
    if expected_contract != actual_contract:
        raise RuntimeError(
            "La base histórica cambió su contenido lógico; se detuvo la carga. "
            "Revisa filas, fechas, CeCo, actividades y evidencias antes de autorizar un nuevo corte"
        )

    expected = str(config.get("baselineSha256") or "").casefold()
    current = file_sha256(baseline).casefold()
    if not expected:
        raise RuntimeError("config/cutover.json no contiene baselineSha256")
    if current == expected:
        return {"changed": False, "enabled": True, **contract}

    try:
        published = json.loads(GENERATED[0].read_text(encoding="utf-8"))
        published_hash = str(published["sources"]["baselineSha256"]).casefold()
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError("No se pudo validar la cadena de custodia de la base histórica") from error
    if published_hash != expected:
        raise RuntimeError(
            "La huella anterior no coincide con la última publicación; se detuvo la reconciliación"
        )

    config["supersedesSha256"] = expected
    config["baselineSha256"] = current
    config["reconciliationReason"] = "Reempaque XLSX verificado sin cambios semánticos"
    atomic_write_text(
        config_path,
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
    )
    print(
        "Huella de corte reconciliada · contenido semántico intacto · "
        f"{str(contract['rows'])} filas · {expected[:12]} → {current[:12]}"
    )
    return {"changed": True, "enabled": True, **contract}


def outputs_current(fingerprints: dict[str, str]) -> bool:
    if not all(path.is_file() and path.stat().st_size > 0 for path in GENERATED):
        return False
    try:
        data = json.loads(GENERATED[0].read_text(encoding="utf-8"))
        validate_xlsx(GENERATED[1], "el Excel generado")
        with GENERATED[2].open("rb") as source:
            signature = source.read(5)
            source.seek(max(GENERATED[2].stat().st_size - 1024, 0))
            trailer = source.read()
        if signature != b"%PDF-" or b"%%EOF" not in trailer:
            return False
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
    cutover = ROOT / "config" / "cutover.json"
    if cutover.is_file():
        try:
            config = json.loads(cutover.read_text(encoding="utf-8"))
            if config.get("enabled") is False:
                return bool(all(expected.values()) and saved == expected and data.get("buildVersion") == output_version(expected))
            baseline = Path(str(config["baseline"]))
            if not baseline.is_absolute():
                baseline = ROOT / baseline
            expected["baselineSha256"] = file_sha256(baseline)
            expected["cutoverConfigSha256"] = file_sha256(cutover)
            saved["baselineSha256"] = sources.get("baselineSha256")
            saved["cutoverConfigSha256"] = sources.get("cutoverConfigSha256")
        except (OSError, ValueError, KeyError, TypeError):
            return False
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


@contextmanager
def configuration_backup(*, restore_on_success: bool = False) -> Iterator[None]:
    """Restaura el corte si falla cualquier validación o si es sólo preflight."""
    target = ROOT / "config" / "cutover.json"
    existed = target.exists()
    original = target.read_bytes() if existed else b""
    try:
        yield
    except BaseException:
        if existed:
            atomic_write_text(target, original.decode("utf-8"))
        else:
            target.unlink(missing_ok=True)
        raise
    else:
        if restore_on_success:
            if existed:
                atomic_write_text(target, original.decode("utf-8"))
            else:
                target.unlink(missing_ok=True)


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
    quarantined = quality.get("quarantinedResponses", [])
    if quarantined:
        print(
            "Filas Forms aisladas sin bloqueo: "
            + ", ".join(str(item["row"]) for item in quarantined)
            + " · no afectan datos ni fecha de corte"
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

    validate_required_validators()
    with exclusive_lock():
        files = cms_sources()
        before = validate_all_xlsx(files)
        with configuration_backup(restore_on_success=args.check_only):
            reconciliation = reconcile_cutover_fingerprint()
            run(sys.executable, "-X", "utf8", "scripts/validate_sources_resilient.py")
            current = outputs_current(before)
            if args.check_only:
                state = "resultados vigentes" if current else "resultados pendientes de reconstrucción"
                suffix = " · huella reconciliable" if reconciliation.get("changed") else ""
                print(f"Preflight aprobado · {len(files)} XLSX · {state}{suffix} · sin cambios")
                return

            removed = clean_obsolete()
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
                run(sys.executable, "-X", "utf8", "tests/validate_cutover.py")
                run(sys.executable, "-X", "utf8", "tests/validate_maintenance.py")
                run(sys.executable, "-X", "utf8", "tests/validate_project.py")
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
