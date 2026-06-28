import asyncio
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from adapters.base import Adapter
from diagnostics import Diagnostic
from registry import ADAPTERS, CheckerSpec


class WorkspacePathError(ValueError):
    """A requested file path resolves outside the workspace root."""


@dataclass
class CheckerResult:
    checker: str
    version: str
    returncode: int | None
    diagnostics: list[Diagnostic]
    raw_stdout: str
    raw_stderr: str
    duration: float


def _write_workspace(files: dict[str, str], base: str) -> None:
    base_path = Path(base).resolve()
    for rel, content in files.items():
        path = (base_path / rel).resolve()
        if not path.is_relative_to(base_path):
            raise WorkspacePathError(f"path escapes workspace: {rel!r}")
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
        cmd = adapter.check_command(spec.executable, workspace, python_version)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=workspace,
        )
        out, err = await proc.communicate()
        stdout, stderr = out.decode(), err.decode()
        diagnostics = adapter.normalize(stdout, workspace)
        return CheckerResult(
            checker=spec.checker,
            version=spec.version,
            returncode=proc.returncode,
            diagnostics=diagnostics,
            raw_stdout=stdout,
            raw_stderr=stderr,
            duration=time.monotonic() - start,
        )
