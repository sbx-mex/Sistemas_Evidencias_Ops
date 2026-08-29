#!/usr/bin/env python3
"""Valida los tres XLSX fuente antes de reconstruir el dashboard."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_dashboard import (
    DEFAULT_CMS,
    DEFAULT_DIRECTORY,
    DEFAULT_RESPONSES,
    DEFAULT_SETTINGS,
    build_payload,
    file_sha256,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Valida integridad, encabezados y cruces de los XLSX fuente.")
    parser.add_argument("--responses", type=Path, default=DEFAULT_RESPONSES)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    args = parser.parse_args()

    payload = build_payload(args.responses, args.directory, args.settings, args.cms)
    quality = payload["quality"]
    schema = quality["responseSchema"]
    conflicting_evidence = {
        key: rows for key, rows in schema.get("evidenceIssues", {}).items()
        if key not in {"generic-evidence-fallback"} and rows
    }
    blocking_issues = {
        "conflictosFilas": schema.get("rowConflicts", []),
        "conflictosEvidencia": conflicting_evidence,
        "conflictosAplicabilidad": schema.get("applicabilityIssues", {}),
        "cecosDesconocidos": quality.get("unknownCeCos", []),
        "vinculosInseguros": quality.get("unsafeEvidenceRows", []),
    }
    if any(blocking_issues.values()):
        raise SystemExit("Fuentes rechazadas: " + json.dumps(blocking_issues, ensure_ascii=False))

    print(
        "Fuentes XLSX aprobadas · "
        f"Forms {quality['responsesRead']} filas · "
        f"{payload['summary']['stores']} tiendas · "
        f"{payload['summary']['activities']} actividades · "
        f"encabezado Forms fila {schema['headerRow']}"
    )
    for label, path in (("Forms", args.responses), ("Directorio", args.directory), ("CMS", args.cms)):
        print(f"{label}: {path.name} · SHA256 {file_sha256(path)[:12]}")


if __name__ == "__main__":
    main()
