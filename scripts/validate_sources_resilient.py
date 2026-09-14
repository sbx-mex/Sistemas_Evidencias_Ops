#!/usr/bin/env python3
"""Preflight resiliente para fuentes OPS.

Mantiene como bloqueos duros los conflictos estructurales y de seguridad, pero
trata los CeCo todavía ausentes del Directorio como filas aisladas. Esas filas
no se publican ni afectan los conteos; quedan reportadas para corrección del
Directorio y se recuperan automáticamente cuando el CeCo exista.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_dashboard import (
    DEFAULT_CMS,
    DEFAULT_DIRECTORY,
    DEFAULT_RESPONSES,
    DEFAULT_SETTINGS,
    STABILITY_CONTROLS,
    build_payload,
    file_sha256,
)
from validate_sources import validate_cms_engine, validate_directory_engine


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida fuentes OPS sin bloquear por CeCo nuevo pendiente de Directorio.")
    parser.add_argument("--responses", type=Path, default=DEFAULT_RESPONSES)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    args = parser.parse_args()

    cms_audit = validate_cms_engine(args.cms)
    directory_audit = validate_directory_engine(args.directory, args.cms, args.settings)

    payload = build_payload(args.responses, args.directory, args.settings, args.cms)
    quality = payload["quality"]
    schema = quality["responseSchema"]
    conflicting_evidence = {
        key: rows
        for key, rows in schema.get("evidenceIssues", {}).items()
        if key not in {"generic-evidence-fallback"} and rows
    }
    isolated_unknown_cecos = quality.get("unknownCeCos", [])
    error_policy = quality.get("responseErrorPolicy", "Aislar fila")
    unresolved_row_conflicts = quality.get("unresolvedRowConflicts", [])
    strict_rows = error_policy == "Bloquear archivo"
    blocking_issues = {
        "conflictosFilas": unresolved_row_conflicts if strict_rows else [],
        "conflictosEvidencia": conflicting_evidence if strict_rows else {},
        "conflictosAplicabilidad": schema.get("applicabilityIssues", {}) if strict_rows else {},
        "conflictosEncuesta": schema.get("surveyIssues", {}) if strict_rows else {},
        "exclusionesObsoletas": quality.get("unusedIgnoredResponseSourceIds", []),
        "vinculosInseguros": quality.get("unsafeEvidenceRows", []) if strict_rows else [],
    }
    if any(blocking_issues.values()):
        raise SystemExit("Fuentes rechazadas: " + json.dumps(blocking_issues, ensure_ascii=False))

    controls = quality.get("stabilityControls", {})
    if tuple(controls) != STABILITY_CONTROLS or not all(controls.values()):
        raise SystemExit("Fuentes rechazadas: controles de estabilidad incompletos")

    print(
        "Fuentes XLSX aprobadas · "
        f"Forms {quality['responsesRead']} filas · "
        f"{payload['summary']['stores']} tiendas · "
        f"{payload['summary']['activities']} actividades · "
        f"encabezado Forms fila {schema['headerRow']}"
    )
    if isolated_unknown_cecos:
        print(
            "ADVERTENCIA NO BLOQUEANTE · CeCo fuera del Directorio aislados: "
            + ", ".join(isolated_unknown_cecos)
            + " · no se publican ni afectan avance; se recuperarán al actualizar Directorio"
        )
    else:
        print("Cruce CeCo · sin filas aisladas")
    quarantined = quality.get("quarantinedResponses", [])
    if quarantined:
        print(
            "ADVERTENCIA NO BLOQUEANTE · filas aisladas por respuesta inválida: "
            + ", ".join(str(item["row"]) for item in quarantined)
            + " · el resto del archivo se publica normalmente"
        )
    recovered = [item for item in quality.get("correctedCeCos", []) if item.get("hadSchemaConflict")]
    if recovered:
        print(
            "Recuperación CeCo verificada · filas: "
            + ", ".join(str(item["row"]) for item in recovered)
            + " · correo corporativo y nombre exacto"
        )

    print(
        "Motores auditados · "
        f"CMS {cms_audit['activities']} actividades / {cms_audit['managers']} DM / "
        f"{cms_audit['openStores']} tiendas abiertas · "
        f"Directorio {directory_audit['stores']} tiendas / {directory_audit['regions']} regiones en {directory_audit['sheet']}"
    )
    for label, path in (("Forms", args.responses), ("Directorio", args.directory), ("CMS", args.cms)):
        print(f"{label}: {path.name} · SHA256 {file_sha256(path)[:12]}")


if __name__ == "__main__":
    main()
