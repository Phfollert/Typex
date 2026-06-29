import asyncio
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from adapters.base import Adapter
from diagnostics import Diagnostic
from registry import ADAPTERS, CheckerSpec


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


# Only these are forwarded to checker subprocesses; everything else (the app's
# venv markers, and any injected secrets such as Fly env vars) is withheld.
# HOME is set explicitly to an empty per-run dir, not forwarded.
_ENV_PASSTHROUGH = (
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
)


def _sandbox_env(home: str) -> dict[str, str]:
    """A minimal, allow-listed environment for checker subprocesses.

    Deny-by-default: the server runs under `uv run` (its venv on PATH +
    VIRTUAL_ENV) and may carry injected secrets, none of which a checker should
    see. We forward only a small safe set plus a PATH with the app venv removed
    -- removed rather than hardcoded so `node` (needed by pyright) keeps its real
    location across dev and the container. With the app venv hidden, checkers
    that discover an interpreter from the environment (pyright/ty/pyrefly) no
    longer resolve the app's dependencies, matching mypy's own-interpreter view.

    `home` is an empty per-run directory used as HOME/XDG_CONFIG_HOME so checkers
    can't pick up user-level config (e.g. ~/.config/mypy, ~/.npmrc).
    """
    src = os.environ
    env = {k: src[k] for k in _ENV_PASSTHROUGH if k in src}
    env["HOME"] = home
    env["XDG_CONFIG_HOME"] = str(Path(home) / ".config")
    hidden = {str(Path(p) / "bin") for p in (sys.prefix, sys.base_prefix)}
    hidden.add(str(Path(sys.executable).parent))
    venv = src.get("VIRTUAL_ENV")
    if venv:
        hidden.add(str(Path(venv) / "bin"))
    path = [p for p in src.get("PATH", "").split(os.pathsep) if p and p not in hidden]
    env["PATH"] = os.pathsep.join(path) or os.defpath.lstrip(os.pathsep)
    return env


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
