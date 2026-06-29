import asyncio
import time
from unittest.mock import AsyncMock, MagicMock

import pytest

from adapters.base import Adapter
from diagnostics import Diagnostic, Severity
from registry import CHECKERS, CHECKERS_BY_ID, CheckerSpec
from runner import (
    NormalizationError,
    CheckerOutputLimitError,
    CheckerTimeoutError,
    UnsupportedFileError,
    run_checker,
    WorkspacePathError,
)

MULTIFILE = {
    "_helper.py": "def add(x: int, y: int) -> int:\n    return x + y\n",
    "main.py": "from _helper import add\n\nresult: str = add(1, 2)\n",
}


class _FakeAdapter(Adapter):
    name = "fake"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [executable]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        return []


@pytest.mark.slow
@pytest.mark.parametrize("checker_id", list(CHECKERS_BY_ID))
def test_run_checker_resolves_multifile_imports(checker_id: str) -> None:
    spec = CHECKERS_BY_ID[checker_id]
    result = asyncio.run(run_checker(spec, MULTIFILE, "3.12"))

    assert result.version == spec.version
    # The _helper import resolved: the sole diagnostic is the cross-file
    # assignment error on main.py, not an "unresolved import" error.
    assert [(d.file, d.line) for d in result.diagnostics] == [("main.py", 3)]


@pytest.mark.parametrize(
    "rel",
    ["../escape.py", "../../etc/escape.py", "sub/../../escape.py", "/tmp/escape.py"],
)
def test_run_checker_rejects_paths_escaping_workspace(rel: str) -> None:
    spec = CheckerSpec(
        id="broken",
        checker="fake",
        version="0",
        executable="/nonexistent/checker",
        color="#000000",
        adapter="fake",
    )
    with pytest.raises(WorkspacePathError):
        asyncio.run(
            run_checker(spec, {rel: "x = 1\n"}, "3.12", adapter=_FakeAdapter())
        )


@pytest.mark.parametrize(
    "key", ["mypy.ini", "pyproject.toml", "pyrightconfig.json", "setup.cfg", "noext"]
)
def test_run_checker_rejects_non_python_files(key: str) -> None:
    spec = CheckerSpec(
        id="broken",
        checker="fake",
        version="0",
        executable="/nonexistent/checker",
        color="#000000",
        adapter="fake",
    )
    with pytest.raises(UnsupportedFileError):
        asyncio.run(
            run_checker(spec, {key: "data\n"}, "3.12", adapter=_FakeAdapter())
        )


def test_run_checker_raises_for_missing_executable() -> None:
    spec = CheckerSpec(
        id="broken",
        checker="fake",
        version="0",
        executable="/nonexistent/checker",
        color="#000000",
        adapter="fake",
    )
    with pytest.raises(FileNotFoundError):
        asyncio.run(
            run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_FakeAdapter())
        )


class _SleepAdapter(Adapter):
    name = "fake"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [executable, "30"]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        return []


def test_run_checker_times_out_and_kills_subprocess(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("runner.CHECK_TIMEOUT_SECONDS", 0.2)
    spec = CheckerSpec(
        id="slow",
        checker="fake",
        version="0",
        executable="/bin/sleep",
        color="#000000",
        adapter="fake",
    )
    start = time.monotonic()
    with pytest.raises(CheckerTimeoutError):
        asyncio.run(
            run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_SleepAdapter())
        )
    # Returned on the timeout, not after the 30s sleep.
    assert time.monotonic() - start < 5


def _mock_proc(stdout: list[bytes], stderr: list[bytes]) -> MagicMock:
    """A stand-in for an asyncio subprocess whose pipes yield preset chunks.

    `.read()` returns each chunk then b"" (EOF); `.kill()`/`.wait()` are mocks
    so the cap path can be driven without spawning anything.
    """
    proc = MagicMock()
    proc.stdout.read = AsyncMock(side_effect=[*stdout, b""])
    proc.stderr.read = AsyncMock(side_effect=[*stderr, b""])
    proc.wait = AsyncMock(return_value=0)
    proc.returncode = 0
    return proc


def _patch_subprocess(monkeypatch: pytest.MonkeyPatch, proc: MagicMock) -> None:
    monkeypatch.setattr(
        asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)
    )


def test_run_checker_sandboxes_subprocess_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("VIRTUAL_ENV", "/app/.venv")
    monkeypatch.setenv("PYTHONPATH", "/leak")
    monkeypatch.setenv("HOME", "/home/serveruser")
    monkeypatch.setattr("runner.NODE_DIR", "/opt/node/bin")
    csx = AsyncMock(return_value=_mock_proc(stdout=[], stderr=[]))
    monkeypatch.setattr(asyncio, "create_subprocess_exec", csx)
    spec = CheckerSpec(
        id="x",
        checker="fake",
        version="0",
        executable="checker",
        color="#000000",
        adapter="fake",
    )
    asyncio.run(run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_FakeAdapter()))

    env = csx.call_args.kwargs["env"]
    # PATH is only the node dir, so the app venv can never be on it.
    assert env["PATH"] == "/opt/node/bin"
    assert "VIRTUAL_ENV" not in env
    assert "PYTHONPATH" not in env
    # HOME is replaced with an empty per-run dir, not the server's home, and the
    # server's XDG_CONFIG_HOME is not forwarded.
    assert env["HOME"] != "/home/serveruser"
    assert "XDG_CONFIG_HOME" not in env


@pytest.mark.slow
def test_pyright_does_not_resolve_app_dependencies() -> None:
    # fastapi is a dependency of the server app, not of any checker venv. With
    # env sandboxing, pyright must not discover it via the app's interpreter.
    pyright = next((s for s in CHECKERS if s.checker == "pyright"), None)
    if pyright is None:
        pytest.skip("no pyright checker provisioned")
    result = asyncio.run(run_checker(pyright, {"main.py": "import fastapi\n"}, "3.12"))
    messages = " ".join(d.message.lower() for d in result.diagnostics)
    assert "could not be resolved" in messages or "fastapi" in messages


def test_run_checker_caps_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("runner.MAX_OUTPUT_BYTES", 1000)
    proc = _mock_proc(stdout=[b"x" * 600, b"x" * 600], stderr=[])
    _patch_subprocess(monkeypatch, proc)
    spec = CheckerSpec(
        id="flood",
        checker="fake",
        version="0",
        executable="checker",
        color="#000000",
        adapter="fake",
    )
    with pytest.raises(CheckerOutputLimitError):
        asyncio.run(
            run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_FakeAdapter())
        )
    # The overflowing process was killed rather than read to completion.
    proc.kill.assert_called_once()


def test_run_checker_does_not_kill_output_under_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("runner.MAX_OUTPUT_BYTES", 1000)
    proc = _mock_proc(stdout=[b"hello\n"], stderr=[b"warn\n"])
    _patch_subprocess(monkeypatch, proc)
    spec = CheckerSpec(
        id="ok",
        checker="fake",
        version="0",
        executable="checker",
        color="#000000",
        adapter="fake",
    )
    result = asyncio.run(
        run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_FakeAdapter())
    )
    assert result.raw_stdout == "hello\n"
    assert result.raw_stderr == "warn\n"


class _CrashAdapter(Adapter):
    name = "fake"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [executable]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        raise ValueError("could not parse")


def _diag(file: str) -> Diagnostic:
    return Diagnostic(
        file=file,
        line=1,
        column=1,
        end_line=1,
        end_column=2,
        severity=Severity.ERROR,
        message="boom",
        code=None,
    )


class _ExternalDiagAdapter(Adapter):
    name = "fake"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [executable]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        return [
            _diag("main.py"),
            _diag("/usr/lib/python3.12/typing.pyi"),
            _diag("../escape.py"),
        ]


def test_run_checker_drops_out_of_workspace_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    proc = _mock_proc(stdout=[b"x"], stderr=[])
    _patch_subprocess(monkeypatch, proc)
    spec = CheckerSpec(
        id="ext",
        checker="fake",
        version="0",
        executable="checker",
        color="#000000",
        adapter="fake",
    )
    result = asyncio.run(
        run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_ExternalDiagAdapter())
    )
    # Only the in-workspace finding survives; the absolute and escaping paths
    # (which the UI can't render and which leak host paths) are dropped.
    assert [d.file for d in result.diagnostics] == ["main.py"]


def test_run_checker_wraps_normalize_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    proc = _mock_proc(stdout=[b"unparseable"], stderr=[b"Traceback ..."])
    _patch_subprocess(monkeypatch, proc)
    spec = CheckerSpec(
        id="crash",
        checker="fake",
        version="0",
        executable="checker",
        color="#000000",
        adapter="fake",
    )
    with pytest.raises(NormalizationError):
        asyncio.run(
            run_checker(spec, {"main.py": "x = 1\n"}, "3.12", adapter=_CrashAdapter())
        )
    proc.kill.assert_not_called()
