#!/usr/bin/env python3
"""Verifica el límite de día en México, independiente de la hora del runner."""
from datetime import date, datetime, timezone
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts import build_dashboard as engine

for utc, mexico_day, status, days in [
    (datetime(2026, 10, 7, 1, tzinfo=timezone.utc), date(2026, 10, 6), "Vigente", 0),
    (datetime(2026, 10, 7, 6, tzinfo=timezone.utc), date(2026, 10, 7), "Vencida", -1),
]:
    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz is not None, "No debe depender de la zona horaria local del runner"
            return utc.astimezone(tz)

    with patch.object(engine, "datetime", Clock):
        assert engine.operational_now().date() == mexico_day
        assert engine.operational_now().utcoffset().total_seconds() == -6 * 3600
        assert engine.date_status(date(2026, 10, 1), date(2026, 10, 6)) == status
        assert engine.deadline_focus("2026-10-06", 1)["daysRemaining"] == days
        with patch.object(engine, "file_sha256", return_value="fixture"), patch.object(engine, "hashlib") as hashing:
            hashing.sha256.return_value.hexdigest.return_value = "0" * 64
            engine.output_version({})
            encoded = hashing.sha256.call_args.args[0]
            assert f'"calendarDate": "{mexico_day.isoformat()}"'.encode() in encoded
print("Calendario México aprobado · medianoche UTC no adelanta vencimientos · versión y fecha operativa congruentes")
