#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
TEXT_FILES = [ROOT / "index.html", ROOT / "styles.css", ROOT / "app.js", ROOT / "service-worker.js", ROOT / "manifest.webmanifest"]
MAX_FILE_BYTES = 20 * 1024 * 1024

missing = []
oversized = []
for source in TEXT_FILES:
    text = source.read_text(encoding="utf-8")
    for reference in re.findall(r"(?:src|href)[=:]\s*[\"'](\./[^\"'#?]+)", text):
        if "${" in reference:
            continue
        target = ROOT / unquote(reference.removeprefix("./"))
        if not target.exists():
            missing.append({"source": source.name, "target": reference})

for path in ROOT.rglob("*"):
    if path.is_file() and ".git" not in path.parts and path.stat().st_size > MAX_FILE_BYTES:
        oversized.append({"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size})

report = {
    "filesReviewed": sum(1 for path in ROOT.rglob("*") if path.is_file() and ".git" not in path.parts),
    "missingReferences": missing,
    "oversizedFiles": oversized,
}
print(json.dumps(report, ensure_ascii=False, indent=2))
if missing or oversized:
    raise SystemExit(1)
