#!/usr/bin/env python3
"""Verifica los archivos del paquete antes de reconstruir con tus Excel vigentes."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent
manifest = json.loads((root / "MANIFEST_CMS_SHA256.json").read_text(encoding="utf-8"))
errors = []
for relative, expected in manifest["archivos"].items():
    target = root / relative
    if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        errors.append(relative)
if errors:
    print("Integridad rechazada: " + ", ".join(errors))
    print("Usa una extracción nueva del ZIP. Si ya reconstruiste, valida con safe_maintenance.py.")
    sys.exit(1)
print(f"Integridad aprobada: {len(manifest['archivos'])} archivos completos.")
changed = []
missing = []
for relative, expected in manifest["fuentesAuditadas"].items():
    target = root / relative
    if not target.is_file():
        missing.append(relative)
    elif hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        changed.append(relative)
if missing:
    print("Aplica el paquete en el repositorio existente; faltan: " + ", ".join(missing))
    sys.exit(1)
if changed:
    print("Las fuentes actuales difieren del corte auditado: " + ", ".join(changed))
    print("Conserva tus Excel vigentes y reconstruye; los conteos del informe son históricos.")
else:
    print("Las fuentes coinciden exactamente con las auditadas.")
print("Siguiente paso: python -X utf8 scripts/safe_maintenance.py --force")
