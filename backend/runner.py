import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from adapters.base import Adapter
from diagnostics import Diagnostic
from registry import ADAPTERS, CheckerSpec


logger = logging.getLogger(__name__)

CHECK_TIMEOUT_SECONDS = 20.0
MAX_OUTPUT_BYTES = 1024 * 1024
_READ_CHUNK = 65536
_ALLOWED_SUFFIXES = (".py", ".pyi")


class RunnerError(Exception):
    """Base for errors raised by the checker runner."""


class WorkspacePathError(RunnerError):
    """A requested file path resolves outside the workspace root."""


class UnsupportedFileError(RunnerError):
    """A requested file is not a Python source/stub file. Restricting inputs to
    `.py`/`.pyi` keeps a user from submitting checker config (mypy.ini,
    pyproject.toml, pyrightconfig.json) that could load plugins or redirect the
    analysis."""


class CheckerTimeoutError(RunnerError):
    """The checker subprocess exceeded its time budget and was killed."""


class CheckerOutputLimitError(RunnerError):
    """The checker produced more output than the allowed cap and was killed."""


class NormalizationError(RunnerError):
    """The checker's output could not be parsed into diagnostics."""


class CheckerFailedError(RunnerError):
    """The adapter reported the run as failed (`run_failed`), so its stdout is not
    the expected diagnostics payload. Usually an exit code outside the checker's
    success set, but an adapter may key on stdout/stderr instead."""


@dataclass
class CheckerResult:
    checker: str
    version: str
    returncode: int | None
    diagnostics: list[Diagnostic]
    raw_stdout: str
    raw_stderr: str
    duration: float


def _kill(proc: asyncio.subprocess.Process) -> None:
    # The process may have already exited and been reaped between the deadline
    # and this call, leaving the PID gone.
    try:
        proc.kill()
    except ProcessLookupError:
        pass


def _resolve_node_dir() -> str | None:
    """The directory containing `node`.

    pyright is a Node program and finds `node` via PATH; the other checkers need
    nothing from PATH.."""
    override = os.environ.get("TYPEX_NODE_DIR")
    if override:
        return override
    node = shutil.which("node")
    return str(Path(node).parent) if node else None


NODE_DIR = _resolve_node_dir()


def _sandbox_env(home: str) -> dict[str, str]:
    """Build the checker subprocess environment from scratch (nothing inherited).

    PATH holds only the `node` directory (needed by pyright); HOME is an empty
    per-run directory.
    """
    return {"HOME": home, "PATH": NODE_DIR or ""}


def _in_workspace(file: str) -> bool:
    """True if a (relativized) diagnostic path stays inside the workspace.

    Checkers can be steered (e.g. via a user-supplied config) to report errors
    in files outside the workspace; `relpath` leaves those absolute. The UI can
    only render findings in submitted files, so out-of-workspace ones are
    dropped rather than returned (which would also leak host paths)."""
    p = Path(file)
    return not p.is_absolute() and ".." not in p.parts


async def _read_capped(
    proc: asyncio.subprocess.Process, limit: int
) -> tuple[bytes, bytes, bool]:
    """Drain stdout and stderr concurrently, capping each at `limit` bytes.

    Returns `(stdout, stderr, truncated)`. On overflow the process is killed
    immediately so the sibling pipe reaches EOF (reading one pipe to its cap
    while the other still blocks the producer would deadlock).
    """
    truncated = False

    async def read(stream: asyncio.StreamReader) -> bytes:
        nonlocal truncated
        buf = bytearray()
        while True:
            data = await stream.read(_READ_CHUNK)
            if not data:
                break
            buf += data
            if len(buf) >= limit:
                del buf[limit:]
                if not truncated:
                    truncated = True
                    _kill(proc)
                break
        return bytes(buf)

    assert proc.stdout is not None and proc.stderr is not None
    out, err = await asyncio.gather(read(proc.stdout), read(proc.stderr))
    return out, err, truncated


def _write_workspace(files: dict[str, str], base: str) -> None:
    base_path = Path(base).resolve()
    for rel, content in files.items():
        if Path(rel).suffix not in _ALLOWED_SUFFIXES:
            raise UnsupportedFileError(f"unsupported file type: {rel!r}")
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
    with (
        tempfile.TemporaryDirectory() as workspace,
        tempfile.TemporaryDirectory() as home,
    ):
        _write_workspace(files, workspace)
        cmd = adapter.check_command(spec.executable, workspace, python_version)
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=workspace,
            env=_sandbox_env(home),
        )
        try:
            out, err, truncated = await asyncio.wait_for(
                _read_capped(proc, MAX_OUTPUT_BYTES), timeout=CHECK_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            _kill(proc)
            await proc.wait()
            raise CheckerTimeoutError(
                f"{spec.id} exceeded {CHECK_TIMEOUT_SECONDS:.0f}s"
            ) from None
        await proc.wait()
        if truncated:
            # Truncated output is unreliable (e.g. a half-written JSON document),
            # so fail rather than emit partial or garbage diagnostics.
            raise CheckerOutputLimitError(
                f"{spec.id} exceeded {MAX_OUTPUT_BYTES} bytes of output"
            )
        stdout, stderr = out.decode(errors="replace"), err.decode(errors="replace")
        if adapter.run_failed(proc.returncode, stdout, stderr):
            # stderr can carry host paths and tracebacks, so it is logged here for
            # debugging but never surfaced to the client.
            logger.warning(
                "checker %s exited %s; stderr: %s",
                spec.id,
                proc.returncode,
                stderr[:2000],
            )
            raise CheckerFailedError(f"{spec.id} exited with code {proc.returncode}")
        try:
            diagnostics = adapter.normalize(stdout, workspace)
        except Exception as exc:
            raise NormalizationError(
                f"{spec.id} produced unparseable output (returncode {proc.returncode})"
            ) from exc
        diagnostics = [d for d in diagnostics if _in_workspace(d.file)]
        return CheckerResult(
            checker=spec.checker,
            version=spec.version,
            returncode=proc.returncode,
            diagnostics=diagnostics,
            raw_stdout=stdout,
            raw_stderr=stderr,
            duration=time.monotonic() - start,
        )
