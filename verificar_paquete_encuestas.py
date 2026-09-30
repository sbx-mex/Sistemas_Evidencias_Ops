#!/usr/bin/env python3
"""Comprueba integridad del paquete y las fuentes antes de reconstruir."""
from pathlib import Path
import hashlib
import json
import sys

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
manifest = json.loads((root / "MANIFEST_ENCUESTAS_SHA256.json").read_text(encoding="utf-8"))

def target(relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Ruta fuera del proyecto: " + relative)
    return path

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

errors = [rel for rel, expected in manifest["archivos"].items()
          if not target(rel).is_file() or sha(target(rel)) != expected]
if errors:
    print("Integridad rechazada: " + ", ".join(errors))
    print("Usa una extracción nueva; si ya reconstruiste, valida con safe_maintenance.py.")
    sys.exit(1)
print(f"Integridad aprobada: {len(manifest['archivos'])} archivos completos.")
missing = [rel for rel in manifest["fuentesAuditadas"] if not target(rel).is_file()]
if missing:
    print("Aplica el paquete al repositorio existente. Faltan: " + ", ".join(missing))
    sys.exit(1)
changed = [rel for rel, expected in manifest["fuentesAuditadas"].items()
           if sha(target(rel)) != expected]
if changed:
    print("Fuentes distintas del corte auditado: " + ", ".join(changed))
    print("Conserva tus fuentes actuales y reconstruye; el informe refleja el corte anterior.")
else:
    print("Las fuentes coinciden exactamente con las auditadas.")
print("Siguiente paso: python -X utf8 scripts/safe_maintenance.py --force")
