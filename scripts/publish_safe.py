#!/usr/bin/env python3
"""Publica sólo resultados validados sobre la última revisión, sin force push."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args, cwd=ROOT, check=True):
    return subprocess.run(["git", *args], cwd=cwd, check=check, text=True, capture_output=True)


def publish(root=ROOT, attempts=3, validate=None):
    def validate_project(work):
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONPYCACHEPREFIX="/tmp/evidencias-ops-pycache")
        subprocess.run([sys.executable, "-X", "utf8", "scripts/safe_maintenance.py", "--force"], cwd=work, env=env, check=True)
        subprocess.run([sys.executable, "-X", "utf8", "tests/validate_publish_safe.py"], cwd=work, env=env, check=True)
        subprocess.run([sys.executable, "-m", "compileall", "-q", "scripts", "tests"], cwd=work, env=env, check=True)
        for filename in ("app.js", "pdf-export.js", "xlsx-export.js", "service-worker.js"):
            subprocess.run(["node", "--check", filename], cwd=work, check=True)
        git("diff", "--check", cwd=work)

    validate = validate or validate_project
    for attempt in range(attempts):
        git("fetch", "origin", "main", cwd=root)
        with tempfile.TemporaryDirectory(prefix="ops-publicacion-") as temp:
            work = Path(temp) / "validated"
            git("worktree", "add", "--detach", str(work), "FETCH_HEAD", cwd=root)
            try:
                validate(work)
                git("add", "--", "data", "exports", "config", "assets", cwd=work)
                if git("diff", "--cached", "--quiet", cwd=work, check=False).returncode == 0:
                    return
                git("-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com", "commit", "-m", "data: actualizar evidencias OPS", cwd=work)
                result = git("push", "origin", "HEAD:refs/heads/main", cwd=work, check=False)
                if result.returncode == 0:
                    return
                if not any(message in result.stderr for message in ("fetch first", "non-fast-forward")):
                    raise RuntimeError(result.stderr)
                print(f"Nueva carga concurrente; reconstruyendo versión más reciente ({attempt + 1}/{attempts})")
            finally:
                git("worktree", "remove", "--force", str(work), cwd=root)
    raise RuntimeError("Las fuentes siguen cambiando; publicación detenida sin sobrescribir cambios. Reejecuta el workflow.")


if __name__ == "__main__":
    publish()
