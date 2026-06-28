import asyncio
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from adapters.base import Adapter
from diagnostics import Diagnostic
from registry import ADAPTERS, CheckerSpec


@dataclass
class CheckerResult:
    checker: str
    version: str
    returncode: int | None
    diagnostics: list[Diagnostic]
    raw_stdout: str
    raw_stderr: str
    error: str | None
    duration: float


def _write_workspace(files: dict[str, str], base: str) -> None:
    for rel, content in files.items():
        path = Path(base) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)


async def run_checker(
    spec: CheckerSpec,
    files: dict[str, str],
    python_version: str,
    adapter: Adapter | None = None,
) -> CheckerResult:
    if adapter is None:
        adapter = ADAPTERS[spec.adapter]
    start = time.monotonic()
    with tempfile.TemporaryDirectory() as workspace:
        _write_workspace(files, workspace)
        try:
            cmd = adapter.check_command(spec.executable, workspace, python_version)
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=workspace,
            )
            out, err = await proc.communicate()
            stdout, stderr = out.decode(), err.decode()
            try:
                diagnostics = adapter.normalize(stdout, workspace)
                error: str | None = None
            except Exception as exc:
                diagnostics = []
                error = f"normalization failed: {exc}"
            return CheckerResult(
                checker=spec.checker,
                version=spec.version,
                returncode=proc.returncode,
                diagnostics=diagnostics,
                raw_stdout=stdout,
                raw_stderr=stderr,
                error=error,
                duration=time.monotonic() - start,
            )
        except Exception as exc:
            return CheckerResult(
                checker=spec.checker,
                version=spec.version,
                returncode=None,
                diagnostics=[],
                raw_stdout="",
                raw_stderr="",
                error=str(exc),
                duration=time.monotonic() - start,
            )
