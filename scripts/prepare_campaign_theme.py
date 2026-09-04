#!/usr/bin/env python3
"""Prepara recursos web cálidos desde el arte oficial Fall 26 proporcionado."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


def save_webp(image: Image.Image, target: Path, size: tuple[int, int], quality: int = 86) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    prepared = ImageOps.fit(image.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    prepared = ImageEnhance.Color(prepared).enhance(1.03)
    prepared = ImageEnhance.Contrast(prepared).enhance(1.015)
    prepared.save(target, "WEBP", quality=quality, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera arte web Fall 26 para hero y pie de página.")
    parser.add_argument("--source", type=Path, required=True, help="PNG oficial Fall 26 proporcionado.")
    parser.add_argument("--output-dir", type=Path, default=Path("assets/campaign"))
    args = parser.parse_args()

    with Image.open(args.source) as source:
        save_webp(source, args.output_dir / "fall-peanuts-card.webp", (720, 720), 88)
        character_band = source.crop((55, 205, 1025, 585))
        save_webp(character_band, args.output_dir / "fall-peanuts-footer.webp", (1160, 420), 88)

    print("Recursos Fall 26 preparados: tarjeta 720×720 y firma 1160×420")


if __name__ == "__main__":
    main()
