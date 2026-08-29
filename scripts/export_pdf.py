#!/usr/bin/env python3
"""Genera el respaldo PDF regional del Sistema de Evidencias OPS."""

from __future__ import annotations

import argparse
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "data" / "dashboard.json"
DEFAULT_OUTPUT = ROOT / "exports" / "Resumen_Evidencias_OPS.pdf"

GREEN = HexColor("#006241")
DARK = HexColor("#1E3932")
SOFT = HexColor("#E9F4EF")
CANVAS = HexColor("#F6F8F7")
MUTED = HexColor("#61736A")
LINE = HexColor("#DCE5E0")
RED = HexColor("#C54435")
AMBER = HexColor("#C98612")
GOOD = HexColor("#16845B")


def percent(value: float) -> str:
    return f"{value:.1f}%"


def number(value: int | float) -> str:
    return f"{int(value):,}"


def fit_text(text: str, font: str, size: float, width: float) -> str:
    value = str(text)
    if stringWidth(value, font, size) <= width:
        return value
    while len(value) > 1 and stringWidth(value + "…", font, size) > width:
        value = value[:-1]
    return value + "…"


def image_reader(path: Path, size: tuple[int, int]) -> ImageReader | None:
    if not path.is_file():
        return None
    with Image.open(path).convert("RGB") as source:
        prepared = ImageOps.fit(source, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.2))
        stream = BytesIO()
        prepared.save(stream, format="PNG", optimize=True)
        stream.seek(0)
        return ImageReader(stream)


def signal(value: float):
    if value >= 80:
        return GOOD
    if value >= 40:
        return AMBER
    return RED


def build_pdf(data: dict, output: Path) -> None:
    page_width, page_height = landscape(A4)
    pdf = canvas.Canvas(str(output), pagesize=(page_width, page_height), pageCompression=1)
    region = data.get("region", "Centro Norte")
    summary = data.get("summary", {})
    report = data.get("report", {})
    director = report.get("regionalDirector", {})
    rows = sorted(data.get("dms", []), key=lambda item: (item.get("rank", 999), item.get("shortName", "")))
    rows_per_page = 6
    total_pages = max(1, (len(rows) + rows_per_page - 1) // rows_per_page)
    logo = image_reader(ROOT / "assets" / "icons" / "icon-64.webp", (80, 80))
    director_photo = image_reader(ROOT / director.get("photo", "assets/director/jorge-alcantar.webp"), (96, 112))

    for page_index in range(total_pages):
        page_rows = rows[page_index * rows_per_page:(page_index + 1) * rows_per_page]
        pdf.setFillColor(CANVAS)
        pdf.rect(0, 0, page_width, page_height, stroke=0, fill=1)
        pdf.setFillColor(GREEN)
        pdf.rect(0, page_height - 126, page_width, 126, stroke=0, fill=1)
        if logo:
            pdf.drawImage(logo, 30, page_height - 94, 52, 52, mask="auto")
        pdf.setFillColor(HexColor("#A9DBC5"))
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawCentredString(page_width / 2, page_height - 27, report.get("motto", "JUNTÉMONOS MÁS"))
        pdf.setFillColor(white)
        pdf.setFont("Helvetica-Bold", 21)
        pdf.drawCentredString(page_width / 2, page_height - 57, report.get("title", "Sistema de Evidencia OPS"))
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawCentredString(page_width / 2, page_height - 78, f"{region} · Corte {report.get('cutOffDisplay', data.get('lastUpdatedDisplay', 'Sin datos'))}")
        pdf.setFillColor(HexColor("#B9E1D0"))

        if director_photo:
            pdf.setFillColor(white)
            pdf.roundRect(page_width - 145, page_height - 103, 48, 61, 8, stroke=0, fill=1)
            pdf.drawImage(director_photo, page_width - 142, page_height - 100, 42, 55, mask="auto")
        pdf.setFillColor(white)
        pdf.setFont("Helvetica-Bold", 8)
        pdf.drawString(page_width - 90, page_height - 65, director.get("name", "Jorge Alcantar"))
        pdf.setFillColor(HexColor("#B9E1D0"))
        pdf.setFont("Helvetica", 7)
        pdf.drawString(page_width - 90, page_height - 79, director.get("role", "Director Regional"))

        cards = [
            ("AVANCE REALIZADO", f"{number(summary.get('completedCompletions', 0))} / {number(summary.get('expectedCompletions', 0))}"),
            ("PENDIENTES", number(summary.get("pendingCompletions", 0))),
            ("% AVANCE", percent(summary.get("compliance", 0))),
        ]
        card_width = (page_width - 76) / 3
        for index, (label, value) in enumerate(cards):
            x = 28 + index * (card_width + 10)
            pdf.setFillColor(SOFT if index == 2 else white)
            pdf.roundRect(x, page_height - 184, card_width, 44, 7, stroke=0, fill=1)
            pdf.setFillColor(MUTED)
            pdf.setFont("Helvetica-Bold", 7)
            pdf.drawCentredString(x + card_width / 2, page_height - 157, label)
            pdf.setFillColor(DARK)
            pdf.setFont("Helvetica-Bold", 15)
            pdf.drawCentredString(x + card_width / 2, page_height - 174, str(value))

        table_top = page_height - 204
        columns = [28, 85, 480, 625, 700]
        headers = ["RANKING", "DM", "AVANCE REALIZADO", "PENDIENTES", "% AVANCE"]
        pdf.setFillColor(DARK)
        pdf.roundRect(28, table_top - 25, page_width - 56, 25, 6, stroke=0, fill=1)
        pdf.setFillColor(white)
        pdf.setFont("Helvetica-Bold", 7)
        for label, x in zip(headers, columns, strict=True):
            pdf.drawString(x + 7, table_top - 16, label)

        row_height = 47
        for local_index, item in enumerate(page_rows):
            y = table_top - 25 - (local_index + 1) * row_height
            pdf.setFillColor(white if local_index % 2 == 0 else HexColor("#F1F6F3"))
            pdf.rect(28, y, page_width - 56, row_height - 1, stroke=0, fill=1)
            pdf.setFillColor(signal(item.get("compliance", 0)))
            pdf.rect(28, y, 4, row_height - 1, stroke=0, fill=1)
            pdf.setFillColor(GREEN)
            pdf.setFont("Helvetica-Bold", 9)
            pdf.drawString(43, y + 19, str(item.get("rank", local_index + 1)))
            photo = image_reader(ROOT / item.get("photo", ""), (64, 72))
            if photo:
                pdf.drawImage(photo, 93, y + 5, 36, 38, mask="auto")
            pdf.setFillColor(DARK)
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(140, y + 25, fit_text(item.get("shortName", "DM"), "Helvetica-Bold", 10, 250))
            pdf.setFillColor(MUTED)
            pdf.setFont("Helvetica", 7)
            pdf.drawString(140, y + 12, f"{number(item.get('stores', 0))} tiendas")
            pdf.setFillColor(DARK)
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(501, y + 19, f"{number(item.get('completed', 0))} / {number(item.get('expected', 0))}")
            pdf.drawString(646, y + 19, number(item.get("pending", 0)))
            pdf.setFillColor(signal(item.get("compliance", 0)))
            pdf.drawString(721, y + 19, percent(item.get("compliance", 0)))
            pdf.setFillColor(LINE)
            pdf.rect(758, y + 16, 50, 6, stroke=0, fill=1)
            pdf.setFillColor(signal(item.get("compliance", 0)))
            pdf.rect(758, y + 16, 50 * min(item.get("compliance", 0), 100) / 100, 6, stroke=0, fill=1)

        pdf.setFillColor(DARK)
        pdf.roundRect(28, 24, page_width - 56, 28, 6, stroke=0, fill=1)
        pdf.setFillColor(white)
        pdf.setFont("Helvetica-Bold", 7)
        pdf.drawString(40, 35, report.get("motto", "JUNTÉMONOS MÁS"))
        pdf.setFillColor(HexColor("#CCE0D7"))
        pdf.setFont("Helvetica", 6.5)
        pdf.drawRightString(page_width - 40, 35, report.get("credits", ""))
        pdf.showPage()

    pdf.setTitle(f"Sistema de Evidencia OPS · {region}")
    pdf.setAuthor("Centro Norte")
    pdf.setSubject("Avance realizado / Pendientes / % Avance")
    pdf.save()


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera el PDF regional desde data/dashboard.json.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    data = json.loads(args.data.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_suffix(args.output.suffix + ".tmp")
    build_pdf(data, temporary_output)
    temporary_output.replace(args.output)
    print(f"PDF generado: {args.output.relative_to(ROOT) if args.output.is_relative_to(ROOT) else args.output}")


if __name__ == "__main__":
    main()
