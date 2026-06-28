import asyncio
import time

import pytest

from adapters.base import Adapter
from diagnostics import Diagnostic
from registry import CHECKERS_BY_ID, CheckerSpec
from runner import CheckerTimeoutError, run_checker, WorkspacePathError

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
