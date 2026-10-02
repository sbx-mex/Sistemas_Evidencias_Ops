#!/usr/bin/env python3
"""Simula cargas concurrentes y fallos sin conectar con GitHub."""
from pathlib import Path
import subprocess
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.publish_safe import publish


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


with tempfile.TemporaryDirectory() as temp:
    base = Path(temp)
    remote, local, editor = (base / name for name in ("remote.git", "runner", "editor"))
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "clone", str(remote), str(local)], check=True, capture_output=True)
    git(local, "checkout", "-b", "main")
    git(local, "config", "user.name", "Prueba")
    git(local, "config", "user.email", "test@example.invalid")
    for directory in ("data", "exports", "config", "assets"):
        (local / directory).mkdir()
        (local / directory / "fixture.txt").write_text("initial")
    (local / "source.txt").write_text("CMS 1")
    (local / "build_dashboard.py").write_text("obsoleto de carga aplanada")
    (local / "scripts").mkdir()
    (local / "scripts" / "residuo.inspect.ndjson").write_text("residuo")
    git(local, "add", "."); git(local, "commit", "-m", "base"); git(local, "push", "origin", "main")
    subprocess.run(["git", "clone", "-b", "main", str(remote), str(editor)], check=True, capture_output=True)
    git(editor, "config", "user.name", "Editor"); git(editor, "config", "user.email", "editor@example.invalid")
    calls = []
    def validate(work):
        content = (work / "source.txt").read_text()
        calls.append(content)
        (work / "data" / "fixture.txt").write_text(content)
        (work / "build_dashboard.py").unlink(missing_ok=True)
        (work / "scripts" / "residuo.inspect.ndjson").unlink(missing_ok=True)
        # Una modificación ajena al build queda fuera del commit.
        (work / "source.txt").write_text("edición incidental")
        if len(calls) == 1:
            (editor / "source.txt").write_text("CMS 2")
            git(editor, "add", "."); git(editor, "commit", "-m", "nueva carga"); git(editor, "push", "origin", "main")
    publish(local, validate=validate)
    assert calls == ["CMS 1", "CMS 2"]
    git(local, "fetch", "origin", "main")
    assert git(local, "show", "FETCH_HEAD:data/fixture.txt") == "CMS 2"
    published_paths = git(local, "ls-tree", "-r", "--name-only", "FETCH_HEAD").splitlines()
    assert "build_dashboard.py" not in published_paths
    assert "scripts/residuo.inspect.ndjson" not in published_paths
    assert git(local, "show", "FETCH_HEAD:source.txt") == "CMS 2"
    before = git(local, "rev-parse", "FETCH_HEAD")
    def fail(work):
        (work / "data" / "fixture.txt").write_text("invalido")
        raise ValueError("CMS rechazado")
    try:
        publish(local, validate=fail)
    except ValueError:
        pass
    else:
        raise AssertionError("Se aceptó una validación fallida")
    git(local, "fetch", "origin", "main")
    assert git(local, "rev-parse", "FETCH_HEAD") == before
    assert len(git(local, "worktree", "list", "--porcelain").split("worktree ")) == 2
print("Publicación segura OK: concurrencia, reconstrucción, rechazo, obsoletos de raíz y scripts publicados; cambios ajenos excluidos")
