#!/usr/bin/env python3
"""Persistencia atómica para evitar archivos públicos incompletos."""

from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import tempfile
from typing import Iterator


@contextmanager
def atomic_output_path(target: Path) -> Iterator[Path]:
    """Entrega una ruta temporal vecina y reemplaza el destino sólo al finalizar."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{target.name}.",
        suffix=".tmp",
        dir=target.parent,
    )
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        yield temporary
        with temporary.open("rb") as source:
            os.fsync(source.fileno())
        os.replace(temporary, target)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def atomic_write_text(target: Path, content: str, *, encoding: str = "utf-8") -> None:
    with atomic_output_path(target) as temporary:
        temporary.write_text(content, encoding=encoding)
