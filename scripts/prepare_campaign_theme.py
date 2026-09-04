#!/usr/bin/env python3
"""Prepara acentos web discretos desde recortes oficiales Fall 26."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance, ImageOps


def save_webp(image: Image.Image, target: Path, size: tuple[int, int], quality: int = 86) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    source = image.convert("RGBA")
    prepared = Image.new("RGBA", size, (255, 248, 236, 255))
    fitted = ImageOps.contain(source, size, method=Image.Resampling.LANCZOS)
    prepared.alpha_composite(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2))
    prepared = prepared.convert("RGB")
    prepared = ImageEnhance.Color(prepared).enhance(1.03)
    prepared = ImageEnhance.Contrast(prepared).enhance(1.015)
    prepared.save(target, "WEBP", quality=quality, method=6)


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera cuatro acentos pequeños Fall 26; no crea arte para el hero.")
    parser.add_argument("--lucy", type=Path, required=True)
    parser.add_argument("--snoopy", type=Path, required=True)
    parser.add_argument("--linus", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("assets/campaign"))
    args = parser.parse_args()

    resources = (
        (args.lucy, "lucy-fall.webp", (112, 150)),
        (args.snoopy, "snoopy-fall.webp", (164, 124)),
        (args.linus, "linus-fall.webp", (164, 124)),
    )
    for source_path, filename, size in resources:
        with Image.open(source_path) as source:
            save_webp(source, args.output_dir / filename, size, 86)

    print("Acentos Fall 26 preparados: Lucy, Snoopy y Linus")


if __name__ == "__main__":
    main()
