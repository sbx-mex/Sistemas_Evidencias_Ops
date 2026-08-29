#!/usr/bin/env python3
"""Construye el dashboard estático desde Forms + Directorio Centro Norte.

Fuentes editoriales:
  - cms/Sistema de Evidencias OPS.xlsx
  - cms/Centro Norte_Directorio.xlsx
  - cms/Sistema_Evidencias_OPS_CMS.xlsx

El navegador nunca procesa los Excel. Este motor valida encabezados, cruza CeCo,
deduplica cumplimiento por tienda/actividad y publica únicamente el JSON mínimo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlsplit

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RESPONSES = ROOT / "cms" / "Sistema de Evidencias OPS.xlsx"
DEFAULT_DIRECTORY = ROOT / "cms" / "Centro Norte_Directorio.xlsx"
DEFAULT_CMS = ROOT / "cms" / "Sistema_Evidencias_OPS_CMS.xlsx"
DEFAULT_SETTINGS = ROOT / "config" / "settings.json"
DEFAULT_OUTPUT = ROOT / "data" / "dashboard.json"

RESPONSE_FIELDS = {
    "id": ("Id",),
    "started": ("Hora de inicio",),
    "finished": ("Hora de finalización", "Hora de finalizacion"),
    "email": ("Correo electrónico", "Correo electronico"),
    "name": ("Nombre",),
    "activity": ("Selecciona la actividad que deseas registrar", "Actividad"),
    "ceco": ("CeCo", "CC", "Centro de costo"),
}

CONFIRMATION_HEADERS = (
    "¿Confirmas que realizaste la actividad seleccionada?",
    "Confirmación",
    "Confirmacion",
)
EVIDENCE_HEADERS = ("Evidencia", "Evidencia del avance")
REQUIRED_RESPONSE_FIELDS = {"activity", "ceco"}
REQUIRED_XLSX_MEMBERS = {"[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"}


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def key_text(value: Any) -> str:
    text = unicodedata.normalize("NFD", clean_text(value).casefold())
    return "".join(char for char in text if unicodedata.category(char) != "Mn")


def compact_key(value: Any) -> str:
    """Clave tolerante a espacios, guiones, &, acentos y cambios de mayúsculas."""
    return re.sub(r"[^a-z0-9]+", "", key_text(value))


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_xlsx(path: Path, label: str) -> None:
    """Rechaza libros incompletos/corruptos antes de que openpyxl los procese."""
    if not path.is_file():
        raise ValueError(f"No existe {label}: {path}")
    if path.suffix.casefold() != ".xlsx":
        raise ValueError(f"{label} debe ser un archivo .xlsx: {path.name}")
    try:
        with zipfile.ZipFile(path) as archive:
            bad_member = archive.testzip()
            missing = REQUIRED_XLSX_MEMBERS.difference(archive.namelist())
    except zipfile.BadZipFile as exc:
        raise ValueError(f"{label} no es un XLSX válido o está dañado: {path.name}") from exc
    if bad_member:
        raise ValueError(f"{label} contiene un componente dañado: {bad_member}")
    if missing:
        raise ValueError(f"{label} está incompleto: faltan {', '.join(sorted(missing))}")


def is_yes(value: Any) -> bool:
    return key_text(value) in {"si", "true", "1", "yes"}


def is_no(value: Any) -> bool:
    return key_text(value) in {"no", "false", "0"}


def setting_list(value: Any) -> list[str]:
    """Normaliza una lista JSON o una lista separada por comas desde el CMS."""
    if isinstance(value, list):
        return [clean_text(item) for item in value if clean_text(item)]
    return [clean_text(item) for item in str(value or "").split(",") if clean_text(item)]


def normalize_ceco(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        value = str(int(value))
    text = clean_text(value).replace(".0", "")
    digits = re.sub(r"\D", "", text)
    return digits if len(digits) == 5 else ""


def evidence_key(activity: str, ceco: str) -> str:
    """Crea una etiqueta estable para identificar la actividad y el CeCo."""
    normalized = unicodedata.normalize("NFD", clean_text(activity))
    ascii_text = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    activity_token = re.sub(r"[^A-Za-z0-9]+", "_", ascii_text).strip("_") or "Evidencia"
    return f"{activity_token}_{ceco or 'CeCo_invalido'}"


def safe_evidence_url(value: Any, allowed_hosts: set[str]) -> str | None:
    """Valida HTTPS y dominio, conservando el vínculo exactamente como llegó."""
    raw = str(value or "").strip()
    if not raw or len(raw) > 2048 or any(char in raw for char in ("\r", "\n", "\t")):
        return None
    try:
        parsed = urlsplit(raw)
        host = (parsed.hostname or "").casefold().rstrip(".")
        if (
            parsed.scheme.casefold() != "https"
            or not host
            or host not in allowed_hosts
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            return None
        return raw
    except ValueError:
        return None


def evidence_filename(url: str | None) -> str:
    """Obtiene el nombre real del archivo desde el último segmento de la URL."""
    if not url:
        return "Sin archivo"
    name = unquote(urlsplit(url).path.rsplit("/", 1)[-1]).strip()
    return re.sub(r"[\r\n\t]", "", name) or "Sin archivo"


def parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    text = clean_text(value)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def resolve_columns(headers: list[Any], contract: dict[str, tuple[str, ...]]) -> dict[str, int]:
    normalized = {key_text(value): index for index, value in enumerate(headers) if clean_text(value)}
    result: dict[str, int] = {}
    missing = []
    for field, aliases in contract.items():
        match = next((normalized[key_text(alias)] for alias in aliases if key_text(alias) in normalized), None)
        if match is None:
            missing.append(aliases[0])
        else:
            result[field] = match
    if missing:
        raise ValueError("Faltan encabezados requeridos: " + ", ".join(missing))
    return result


def matching_columns(headers: list[Any], aliases: tuple[str, ...]) -> list[int]:
    """Devuelve todas las columnas equivalentes, incluso si Forms las duplicó."""
    alias_keys = {key_text(alias) for alias in aliases}
    result = []
    for index, header in enumerate(headers):
        current = key_text(header)
        if not current:
            continue
        # Excel puede añadir sufijos .1 o (2) al desambiguar encabezados repetidos.
        without_duplicate_suffix = re.sub(r"(?:\s*[.(]\s*\d+\s*\)?|\.\d+)$", "", current).strip()
        if current in alias_keys or without_duplicate_suffix in alias_keys:
            result.append(index)
    return result


def evidence_header_activity(header: Any) -> str | None:
    """Obtiene la actividad codificada en Evidencia_<Actividad>; None = genérica."""
    raw = key_text(header)
    if not raw.startswith("evidencia"):
        return None
    if raw in {key_text(item) for item in EVIDENCE_HEADERS} or raw.startswith("evidencia del avance (pregunta"):
        return None
    suffix = re.sub(r"^evidencia(?:\s+del\s+avance)?", "", raw, count=1)
    suffix = re.sub(r"\b(?:pregunta\s+no\s+anonima|respuesta\s+necesaria|cargar\s+archivo)\b", "", suffix)
    return compact_key(suffix) or None


def evidence_columns(headers: list[Any]) -> list[dict[str, Any]]:
    result = []
    for index, header in enumerate(headers):
        if key_text(header).startswith("evidencia"):
            result.append({
                "index": index,
                "header": clean_text(header),
                "activityKey": evidence_header_activity(header),
            })
    return result


def coalesce_row_value(row: tuple[Any, ...], indices: list[int]) -> tuple[str, bool]:
    """Une columnas equivalentes. Si hay valores distintos, no adivina."""
    values = []
    for index in indices:
        value = clean_text(row[index]) if index < len(row) else ""
        if value and value not in values:
            values.append(value)
    return (values[0] if len(values) == 1 else "", len(values) > 1)


def resolve_evidence_value(
    row: tuple[Any, ...],
    columns: list[dict[str, Any]],
    activity: str,
) -> tuple[str, str, str | None]:
    """Selecciona la evidencia por actividad y reporta ambigüedades sin mezclar archivos."""
    populated = []
    for column in columns:
        index = column["index"]
        value = clean_text(row[index]) if index < len(row) else ""
        if value:
            populated.append({**column, "value": value})
    if not populated:
        return "", "", None

    activity_key = compact_key(activity)
    exact = [item for item in populated if item["activityKey"] == activity_key]
    exact_values = list(dict.fromkeys(item["value"] for item in exact))
    all_values = list(dict.fromkeys(item["value"] for item in populated))
    if len(exact_values) == 1:
        issue = "multiple-evidence-columns" if len(all_values) > 1 else None
        source = next(item["header"] for item in exact if item["value"] == exact_values[0])
        return exact_values[0], source, issue
    if len(exact_values) > 1:
        return "", "", "ambiguous-matching-evidence"

    generic = [item for item in populated if item["activityKey"] is None]
    generic_values = list(dict.fromkeys(item["value"] for item in generic))
    if len(generic_values) == 1 and len(all_values) == 1:
        source = next(item["header"] for item in generic if item["value"] == generic_values[0])
        return generic_values[0], source, "generic-evidence-fallback"
    if len(all_values) == 1:
        # Una evidencia en la columna de otra actividad no se reasigna por inferencia.
        return "", "", "mismatched-evidence-column"
    return "", "", "ambiguous-evidence"


def load_settings(path: Path, cms_settings: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = json.loads(path.read_text(encoding="utf-8"))
    settings.update(cms_settings or {})
    return settings


def parse_date(value: Any):
    if isinstance(value, datetime):
        return value.date()
    text = clean_text(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Fecha CMS inválida: {text}")


def date_status(start, end) -> str:
    today = datetime.now().date()
    if start and today < start:
        return "Programada"
    if end and today > end:
        return "Vencida"
    return "Vigente"


def find_header(ws, required: set[str]) -> tuple[int, dict[str, int]]:
    for row_number, row in enumerate(ws.iter_rows(min_row=1, max_row=12, values_only=True), 1):
        normalized = {key_text(value): index for index, value in enumerate(row) if clean_text(value)}
        if required.issubset(normalized):
            return row_number, normalized
    raise ValueError(f"No se encontró encabezado {', '.join(sorted(required))} en {ws.title}")


def load_cms(path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, str]], dict[str, Any], dict[str, int]]:
    """Lee actividades, fechas, gerentes y configuración desde un solo Excel CMS."""
    validate_xlsx(path, "el CMS maestro")
    workbook = load_workbook(path, read_only=True, data_only=False)
    required_sheets = {"Actividades", "Gerentes", "Configuracion"}
    missing = required_sheets.difference(workbook.sheetnames)
    if missing:
        raise ValueError("Faltan hojas CMS: " + ", ".join(sorted(missing)))

    config_ws = workbook["Configuracion"]
    config_header, config_cols = find_header(config_ws, {"clave", "valor"})
    cms_settings: dict[str, Any] = {}
    boolean_keys = {"onlyOpenStores", "requireEvidence", "publishEvidenceLinks", "publishPersonalData"}
    for row in config_ws.iter_rows(min_row=config_header + 1, values_only=True):
        key = clean_text(row[config_cols["clave"]])
        if not key:
            continue
        value = row[config_cols["valor"]]
        cms_settings[key] = is_yes(value) if key in boolean_keys else clean_text(value)

    activity_ws = workbook["Actividades"]
    header_row, cols = find_header(activity_ws, {"orden", "actividad", "descripcion", "fecha inicio", "fecha limite", "activo"})
    activities = []
    calendar = {"active": 0, "scheduled": 0, "expired": 0, "inactive": 0}
    for row in activity_ws.iter_rows(min_row=header_row + 1, values_only=True):
        name = clean_text(row[cols["actividad"]])
        if not name:
            continue
        active = is_yes(row[cols["activo"]])
        start = parse_date(row[cols["fecha inicio"]])
        end = parse_date(row[cols["fecha limite"]])
        if start and end and end < start:
            raise ValueError(f"La fecha límite de {name} es anterior a la fecha de inicio")
        status = date_status(start, end)
        if not active:
            calendar["inactive"] += 1
            continue
        if status == "Programada":
            calendar["scheduled"] += 1
            continue
        if status == "Vencida":
            calendar["expired"] += 1
            continue
        calendar["active"] += 1
        evidence_col = cols.get("evidencia requerida")
        priority_col = cols.get("prioridad")
        activities.append({
            "name": name,
            "description": clean_text(row[cols["descripcion"]]),
            "order": int(float(row[cols["orden"]] or 999)),
            "startDate": start.isoformat() if start else None,
            "endDate": end.isoformat() if end else None,
            "commitmentDateDisplay": end.strftime("%d/%m/%y") if end else "Sin fecha compromiso",
            "requireEvidence": is_yes(row[evidence_col]) if evidence_col is not None else True,
            "priority": clean_text(row[priority_col]) if priority_col is not None else "Media",
            "autoDetected": False,
        })

    manager_ws = workbook["Gerentes"]
    manager_header, manager_cols = find_header(manager_ws, {"dm", "nombre corto", "foto webp", "activo"})
    managers: dict[str, dict[str, str]] = {}
    for row in manager_ws.iter_rows(min_row=manager_header + 1, values_only=True):
        dm = clean_text(row[manager_cols["dm"]])
        if not dm or not is_yes(row[manager_cols["activo"]]):
            continue
        photo = clean_text(row[manager_cols["foto webp"]])
        if photo and not (ROOT / photo).is_file():
            raise ValueError(f"No existe la fotografía configurada para {dm}: {photo}")
        managers[key_text(dm)] = {
            "shortName": clean_text(row[manager_cols["nombre corto"]]) or dm,
            "photo": photo,
        }
    return sorted(activities, key=lambda item: (item["order"], key_text(item["name"]))), managers, cms_settings, calendar


def status_label(compliance: float) -> str:
    if compliance >= 80:
        return "En meta"
    if compliance >= 40:
        return "Seguimiento"
    return "Atención"


def find_directory_header(ws) -> tuple[int, list[Any]]:
    for row_number, row in enumerate(ws.iter_rows(min_row=1, max_row=min(ws.max_row, 12), values_only=True), 1):
        keys = {key_text(value) for value in row if clean_text(value)}
        if {"cc", "cc nombre", "dm"}.issubset(keys):
            return row_number, list(row)
    raise ValueError(f"No se encontró encabezado CC / CC Nombre / DM en {ws.title}")


def load_directory(path: Path, settings: dict[str, Any]) -> tuple[dict[str, dict[str, str]], str]:
    validate_xlsx(path, "el directorio")
    workbook = load_workbook(path, read_only=True, data_only=True)
    requested = settings.get("directorySheet")
    if requested not in workbook.sheetnames:
        requested = max(workbook.sheetnames, key=lambda name: workbook[name].max_row)
    ws = workbook[requested]
    header_row, headers = find_directory_header(ws)
    normalized = {key_text(value): index for index, value in enumerate(headers) if clean_text(value)}
    required = ("cc", "cc nombre", "region", "estatus", "dm")
    missing = [field for field in required if field not in normalized]
    if missing:
        raise ValueError("Directorio incompleto: " + ", ".join(missing))

    stores: dict[str, dict[str, str]] = {}
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        ceco = normalize_ceco(row[normalized["cc"]])
        if not ceco:
            continue
        region = clean_text(row[normalized["region"]])
        status = clean_text(row[normalized["estatus"]])
        if settings.get("region") and key_text(region) != key_text(settings["region"]):
            continue
        if settings.get("onlyOpenStores") and key_text(status) not in {"abierta", "abierto", "activa", "activo"}:
            continue
        stores[ceco] = {
            "ceco": ceco,
            "store": clean_text(row[normalized["cc nombre"]]) or f"Tienda {ceco}",
            "dm": clean_text(row[normalized["dm"]]) or "Sin DM",
            "region": region,
            "status": status,
        }
    return stores, requested


def find_response_source(workbook) -> tuple[Any, int, list[Any]]:
    """Localiza hoja y fila de encabezados aunque Forms agregue portada o filas previas."""
    candidates = []
    for sheet_index, ws in enumerate(workbook.worksheets):
        scan_limit = min(max(ws.max_row, 1), 25)
        for row_number, row in enumerate(ws.iter_rows(min_row=1, max_row=scan_limit, values_only=True), 1):
            headers = list(row)
            activity_columns = matching_columns(headers, RESPONSE_FIELDS["activity"])
            ceco_columns = matching_columns(headers, RESPONSE_FIELDS["ceco"])
            evidence_group = evidence_columns(headers)
            if activity_columns and ceco_columns and evidence_group:
                score = len(evidence_group) * 100 + sum(
                    bool(matching_columns(headers, aliases)) for aliases in RESPONSE_FIELDS.values()
                )
                candidates.append((score, -sheet_index, -row_number, ws, row_number, headers))
    if not candidates:
        raise ValueError("No se encontró una tabla Forms con Actividad, CeCo y Evidencia")
    _, _, _, ws, header_row, headers = max(candidates, key=lambda item: item[:3])
    return ws, header_row, headers


def load_responses(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Lee exportaciones Forms antiguas, anchas o normalizadas por filas.

    Soporta una sola columna genérica de evidencia, múltiples columnas
    Evidencia_<Actividad>, encabezados duplicados y columnas reordenadas.
    """
    validate_xlsx(path, "la exportación de Forms")
    workbook = load_workbook(path, read_only=True, data_only=True)
    ws, header_row, headers = find_response_source(workbook)
    rows = ws.iter_rows(min_row=header_row + 1, values_only=True)
    column_groups = {field: matching_columns(headers, aliases) for field, aliases in RESPONSE_FIELDS.items()}
    missing = [RESPONSE_FIELDS[field][0] for field in REQUIRED_RESPONSE_FIELDS if not column_groups[field]]
    if missing:
        raise ValueError("Faltan encabezados requeridos: " + ", ".join(missing))
    confirmation_columns = matching_columns(headers, CONFIRMATION_HEADERS)
    evidence_group = evidence_columns(headers)
    if not evidence_group:
        raise ValueError("No se encontró ninguna columna de evidencia")

    responses = []
    conflicts = []
    evidence_issues: dict[str, list[int]] = defaultdict(list)
    for row_number, row in enumerate(rows, header_row + 1):
        if not any(value not in (None, "") for value in row):
            continue
        values: dict[str, str] = {}
        row_has_conflict = False
        for field, indices in column_groups.items():
            values[field], conflict = coalesce_row_value(row, indices)
            if conflict:
                conflicts.append({"row": row_number, "field": field})
                row_has_conflict = True
        confirmation, confirmation_conflict = coalesce_row_value(row, confirmation_columns)
        if confirmation_conflict:
            conflicts.append({"row": row_number, "field": "confirmed"})
            row_has_conflict = True
        evidence, evidence_source, evidence_issue = resolve_evidence_value(row, evidence_group, values["activity"])
        if evidence_issue:
            evidence_issues[evidence_issue].append(row_number)
        finished = parse_datetime(values["finished"])
        # Registrar una actividad en Forms equivale a confirmarla. La respuesta de
        # confirmación puede permanecer en exportaciones históricas, pero nunca
        # cambia aplicabilidad ni cumplimiento. La evidencia sigue siendo obligatoria
        # cuando así lo define el CMS.
        confirmed = bool(values["activity"])
        responses.append({
            "row": row_number,
            "id": values["id"] or str(row_number - 1),
            "started": parse_datetime(values["started"]),
            "finished": finished,
            "email": values["email"],
            "name": values["name"],
            "activity": values["activity"],
            "ceco": normalize_ceco(values["ceco"]),
            "confirmedAnswer": "Sí" if values["activity"] else "",
            "confirmed": confirmed and not row_has_conflict,
            "explicitNo": False,
            "evidence": evidence,
            "evidenceSourceHeader": evidence_source,
            "schemaConflict": row_has_conflict,
            "evidenceIssue": evidence_issue,
        })
    schema = {
        "sheet": ws.title,
        "headerRow": header_row,
        "columns": len(headers),
        "activityHeaders": [clean_text(headers[index]) for index in column_groups["activity"]],
        "cecoHeaders": [clean_text(headers[index]) for index in column_groups["ceco"]],
        "confirmationHeaders": [clean_text(headers[index]) for index in confirmation_columns],
        "evidenceHeaders": [item["header"] for item in evidence_group],
        "evidenceHeaderMap": {
            item["header"]: item["activityKey"] or "generic"
            for item in evidence_group
        },
        "rowConflicts": conflicts,
        "evidenceIssues": dict(evidence_issues),
    }
    return responses, schema


def iso_or_none(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value else None


def build_payload(
    responses_path: Path,
    directory_path: Path,
    settings_path: Path,
    cms_path: Path = DEFAULT_CMS,
) -> dict[str, Any]:
    activities, managers, cms_settings, calendar = load_cms(cms_path)
    settings = load_settings(settings_path, cms_settings)
    allowed_hosts = {
        host.strip().casefold().rstrip(".")
        for host in clean_text(settings.get("evidenceAllowedHosts", "grupovips-my.sharepoint.com")).split(",")
        if host.strip()
    }
    regional_director_photo = clean_text(settings.get("regionalDirectorPhoto", "assets/director/jorge-alcantar.webp"))
    if regional_director_photo and not (ROOT / regional_director_photo).is_file():
        raise ValueError(f"No existe la fotografía del Director Regional: {regional_director_photo}")
    stores, directory_sheet = load_directory(directory_path, settings)
    responses, response_schema = load_responses(responses_path)

    # El Forms acumula historia; sólo el CMS decide qué actividades se publican.
    configured = {key_text(item["name"]): item for item in activities}
    for item in activities:
        item["noMeansNotApplicable"] = False
    activity_names = [item["name"] for item in activities]
    canonical_activity = {key_text(item["name"]): item["name"] for item in activities}
    evidence_rules = {key_text(item["name"]): item.get("requireEvidence", True) for item in activities}

    submissions = []
    latest_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    unknown_cecos = set()
    invalid_rows = []
    unsafe_evidence_rows = []
    hidden_activity_rows = []
    hidden_activities = set()
    latest_update = None

    for response in responses:
        store = stores.get(response["ceco"])
        activity_key = key_text(response["activity"])
        if response["ceco"] and not store:
            unknown_cecos.add(response["ceco"])
        if response["finished"] and (latest_update is None or response["finished"] > latest_update):
            latest_update = response["finished"]
        if not activity_key:
            invalid_rows.append(response["row"])
            continue
        if activity_key not in configured:
            hidden_activity_rows.append(response["row"])
            hidden_activities.add(response["activity"])
            continue

        activity = canonical_activity[activity_key]
        evidence_url = safe_evidence_url(response["evidence"], allowed_hosts)
        evidence_available = evidence_url is not None
        not_applicable = False
        if response["evidence"] and not evidence_available:
            unsafe_evidence_rows.append(response["row"])
        valid = bool(
            store
            and activity
            and response["confirmed"]
            and (evidence_available or not evidence_rules.get(key_text(activity), settings.get("requireEvidence", True)))
        )
        if not valid and not not_applicable:
            invalid_rows.append(response["row"])

        key = evidence_key(activity or "Evidencia", response["ceco"])
        public = {
            "id": response["id"],
            "timestamp": iso_or_none(response["finished"]),
            "timestampDisplay": response["finished"].strftime("%d/%m/%Y %H:%M") if response["finished"] else "Sin fecha",
            "activity": activity or "Sin actividad",
            "ceco": response["ceco"] or "Inválido",
            "store": store["store"] if store else "CeCo sin cruce",
            "dm": store["dm"] if store else "Sin asignar",
            "evidenceKey": key,
            "evidenceLinkLabel": f"Link_{key}",
            "evidenceFileName": evidence_filename(evidence_url),
            "evidenceSourceHeader": response["evidenceSourceHeader"],
            "confirmed": response["confirmed"],
            "answer": response["confirmedAnswer"],
            "notApplicable": not_applicable,
            "status": "No aplica" if not_applicable else ("Realizada" if valid else "Pendiente"),
            "evidenceAvailable": evidence_available,
            "evidenceLinkPublished": bool(settings.get("publishEvidenceLinks") and evidence_url),
            "valid": valid,
        }
        if settings.get("publishEvidenceLinks") and evidence_url:
            public["evidenceUrl"] = evidence_url
        if settings.get("publishPersonalData"):
            public["submittedBy"] = response["name"]
            public["email"] = response["email"]
        submissions.append(public)

        if valid:
            pair = (response["ceco"], activity)
            current = latest_by_pair.get(pair)
            if current is None or (response["finished"] or datetime.min) > (current["finished"] or datetime.min):
                latest_by_pair[pair] = response

    not_applicable_pairs: set[tuple[str, str]] = set()
    completion_pairs = set(latest_by_pair)
    store_rows = []
    for ceco, store in sorted(stores.items(), key=lambda item: (key_text(item[1]["dm"]), key_text(item[1]["store"]))):
        status = {activity: (ceco, activity) in completion_pairs for activity in activity_names}
        applicability = {activity: (ceco, activity) not in not_applicable_pairs for activity in activity_names}
        completed = sum(status.values())
        expected = sum(applicability.values())
        not_applicable = len(activity_names) - expected
        timestamps = [item["finished"] for (pair_ceco, _), item in latest_by_pair.items() if pair_ceco == ceco and item["finished"]]
        store_rows.append({
            **store,
            "completed": completed,
            "expected": expected,
            "notApplicable": not_applicable,
            "compliance": round(completed / expected * 100, 1) if expected else 0,
            "lastUpdate": iso_or_none(max(timestamps)) if timestamps else None,
            "activities": status,
            "applicableActivities": applicability,
        })

    activity_stats = []
    for item in activities:
        completed = sum((ceco, item["name"]) in completion_pairs for ceco in stores)
        not_applicable = sum((ceco, item["name"]) in not_applicable_pairs for ceco in stores)
        applicable = len(stores) - not_applicable
        activity_stats.append({
            **item,
            "completedStores": completed,
            "applicableStores": applicable,
            "notApplicableStores": not_applicable,
            "pendingStores": applicable - completed,
            "compliance": round(completed / applicable * 100, 1) if applicable else 0,
        })

    dm_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for store in store_rows:
        dm_groups[store["dm"]].append(store)
    dm_stats = []
    for dm, dm_stores in sorted(dm_groups.items(), key=lambda item: key_text(item[0])):
        completed = sum(store["completed"] for store in dm_stores)
        expected = sum(store["expected"] for store in dm_stores)
        not_applicable = sum(store["notApplicable"] for store in dm_stores)
        compliance = round(completed / expected * 100, 1) if expected else 0
        profile = managers.get(key_text(dm), {})
        pending_stores = sum(store["completed"] < store["expected"] for store in dm_stores)
        dm_stats.append({
            "dm": dm,
            "shortName": profile.get("shortName", dm),
            "photo": profile.get("photo", ""),
            "stores": len(dm_stores),
            "completed": completed,
            "expected": expected,
            "notApplicable": not_applicable,
            "pending": expected - completed,
            "pendingStores": pending_stores,
            "compliance": compliance,
            "status": status_label(compliance),
        })
    dm_stats.sort(key=lambda item: (-item["compliance"], key_text(item["shortName"])))
    for rank, item in enumerate(dm_stats, 1):
        item["rank"] = rank

    not_applicable_total = len(not_applicable_pairs)
    expected_total = len(stores) * len(activity_names) - not_applicable_total
    completed_total = len(completion_pairs)
    valid_responses = sum(item["valid"] for item in submissions)
    stores_complete = sum(item["completed"] == item["expected"] and item["expected"] > 0 for item in store_rows)

    return {
        "schemaVersion": 10,
        "project": settings.get("projectName", "Sistema de Evidencias OPS"),
        "region": settings.get("region", "Centro Norte"),
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "lastUpdated": iso_or_none(latest_update),
        "lastUpdatedDisplay": latest_update.strftime("%d/%m/%Y %H:%M") if latest_update else "Sin respuestas",
        "report": {
            "title": "Sistema de Evidencia OPS",
            "subtitle": "Dashboard de Avance de Actividades",
            "motto": "JUNTÉMONOS MÁS",
            "credits": "Diseñado por Jorge Alcantar Aguiar & Enrique César Flores",
            "cutOffDisplay": latest_update.strftime("%d/%m/%y · %H:%M h") if latest_update else "Sin datos",
            "regionalDirector": {
                "name": clean_text(settings.get("regionalDirectorName", "Jorge Alcantar")),
                "role": "Director Regional",
                "photo": regional_director_photo,
            },
        },
        "sources": {
            "responses": responses_path.name,
            "responsesSha256": file_sha256(responses_path),
            "directory": directory_path.name,
            "directorySha256": file_sha256(directory_path),
            "directorySheet": directory_sheet,
            "cms": cms_path.name,
            "cmsSha256": file_sha256(cms_path),
        },
        "summary": {
            "dms": len(dm_stats),
            "stores": len(stores),
            "activities": len(activity_names),
            "expectedCompletions": expected_total,
            "completedCompletions": completed_total,
            "compliance": round(completed_total / expected_total * 100, 1) if expected_total else 0,
            "validResponses": valid_responses,
            "storesComplete": stores_complete,
            "pendingCompletions": expected_total - completed_total,
            "notApplicableCompletions": not_applicable_total,
        },
        "quality": {
            "responsesRead": len(responses),
            "invalidRows": invalid_rows,
            "unknownCeCos": sorted(unknown_cecos),
            "hiddenActivityRows": hidden_activity_rows,
            "hiddenActivities": sorted(hidden_activities, key=key_text),
            "duplicateValidResponses": max(valid_responses - completed_total, 0),
            "unsafeEvidenceRows": unsafe_evidence_rows,
            "responseSchema": response_schema,
            "notApplicableResponses": sum(item["notApplicable"] for item in submissions),
            "notApplicablePairs": not_applicable_total,
            "evidenceLinksPublished": sum(bool(item.get("evidenceUrl")) for item in submissions),
            "privacyMode": not settings.get("publishPersonalData") and not settings.get("publishEvidenceLinks"),
        },
        "calendar": calendar,
        "activities": activity_stats,
        "dms": dm_stats,
        "attention": sorted(
            [
                {
                    "ceco": store["ceco"],
                    "store": store["store"],
                    "dm": store["dm"],
                    "completed": store["completed"],
                    "expected": store["expected"],
                    "notApplicable": store["notApplicable"],
                    "pending": store["expected"] - store["completed"],
                    "compliance": store["compliance"],
                    "status": status_label(store["compliance"]),
                }
                for store in store_rows
                if store["completed"] < store["expected"]
            ],
            key=lambda item: (item["compliance"], key_text(item["dm"]), key_text(item["store"])),
        ),
        "stores": store_rows,
        "submissions": sorted(submissions, key=lambda item: item["timestamp"] or "", reverse=True),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera data/dashboard.json desde los Excel del proyecto.")
    parser.add_argument("--responses", type=Path, default=DEFAULT_RESPONSES)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS)
    parser.add_argument("--cms", type=Path, default=DEFAULT_CMS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    payload = build_payload(args.responses, args.directory, args.settings, args.cms)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary_output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_output.replace(args.output)
    summary = payload["summary"]
    print(
        f"Dashboard generado: {summary['stores']} tiendas · {summary['activities']} actividades · "
        f"{summary['completedCompletions']}/{summary['expectedCompletions']} cumplimientos"
    )
    print(f"Última actualización Forms: {payload['lastUpdatedDisplay']}")


if __name__ == "__main__":
    main()
