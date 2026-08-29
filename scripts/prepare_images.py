#!/usr/bin/env python3
"""Normaliza fotografías DM y genera recursos PWA desde el logo OPS."""

from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
UPLOAD = ROOT.parent / "upload"

PHOTOS = {
    "Enrique Cesar.jpeg": "enrique-cesar.webp",
    "Nancy Carolina.jpeg": "nancy-carolina.webp",
    "Vanessa Carreño.jpeg": "vanessa-carreno.webp",
    "Veronica Garcia.jpeg": "veronica-garcia.webp",
    "Yazmin Chabela.jpeg": "yazmin-chabela.webp",
    "Yazmin Garcia.jpeg": "yazmin-garcia.webp",
}


def main() -> None:
    dm_dir = ROOT / "assets" / "dm"
    icon_dir = ROOT / "assets" / "icons"
    dm_dir.mkdir(parents=True, exist_ok=True)
    icon_dir.mkdir(parents=True, exist_ok=True)

    for source_name, target_name in PHOTOS.items():
        source = UPLOAD / source_name
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            crop = ImageOps.fit(image, (640, 800), method=Image.Resampling.LANCZOS, centering=(0.5, 0.30))
            crop.save(dm_dir / target_name, "WEBP", quality=84, method=6)

    logo_source = UPLOAD / "c5813ed5-3e30-4360-b3d9-b8423332c71e.png"
    with Image.open(logo_source) as logo:
        logo = ImageOps.exif_transpose(logo).convert("RGBA")
        bbox = logo.getbbox()
        if bbox:
            logo = logo.crop(bbox)
        logo.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        logo.save(icon_dir / "ops-logo.webp", "WEBP", quality=92, method=6)
        icon_mark = logo.crop((0, 0, logo.width, int(logo.height * 0.72)))
        mark_bbox = icon_mark.getbbox()
        if mark_bbox:
            icon_mark = icon_mark.crop(mark_bbox)
        for size in (64, 192, 512):
            canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
            fitted = icon_mark.copy()
            fitted.thumbnail((int(size * 0.88), int(size * 0.88)), Image.Resampling.LANCZOS)
            canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
            canvas.save(icon_dir / f"icon-{size}.png", "PNG", optimize=True)
            canvas.save(icon_dir / f"icon-{size}.webp", "WEBP", quality=92, method=6)

    print("6 fotografías WebP y 7 recursos de logo generados")


if __name__ == "__main__":
    main()
