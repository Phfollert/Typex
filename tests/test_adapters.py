"""Adapter tests, exercised only through real typechecker runs."""

import subprocess
from pathlib import Path

import pytest

from adapters.base import Adapter
from adapters.mypy_adapter import MypyAdapter
from adapters.pyright_adapter import PyrightAdapter
from adapters.pyrefly_adapter import PyreflyAdapter
from adapters.ty_adapter import TyAdapter
from diagnostics import Diagnostic, Severity

CHECKERS: list[tuple[type[Adapter], str]] = [
    (MypyAdapter, "assignment"),
    (PyrightAdapter, "reportAssignmentType"),
    (TyAdapter, "invalid-assignment"),
    (PyreflyAdapter, "bad-assignment"),
]

ASSIGNMENT_SNIPPET = "a: int = 2.0\nb: str = a + 1\n"
# typing.Self exists only in 3.11+, so this errors at 3.10 and passes at 3.13.
VERSION_GATED_SNIPPET = "from typing import Self\n\n\nclass C:\n    def clone(self) -> Self:\n        return self\n"


def _run(
    adapter: Adapter, workspace_dir: str, python_version: str = "3.12"
) -> list[Diagnostic]:
    out = subprocess.run(
        adapter.check_command(workspace_dir, python_version),
        capture_output=True,
        text=True,
    )
    return adapter.normalize(out.stdout, workspace_dir)


@pytest.mark.slow
@pytest.mark.parametrize("adapter_cls,expected_code", CHECKERS)
def test_real_run_normalizes_assignment_errors(
    tmp_path: Path, adapter_cls: type[Adapter], expected_code: str
) -> None:
    (tmp_path / "main.py").write_text(ASSIGNMENT_SNIPPET)
    diags = _run(adapter_cls(), str(tmp_path))

    assert len(diags) == 2
    assert sorted(d.line for d in diags) == [1, 2]
    for d in diags:
        assert d.file == "main.py"
        assert d.severity == Severity.ERROR
        assert d.code == expected_code
        assert d.column == 10


@pytest.mark.slow
@pytest.mark.parametrize("adapter_cls,_", CHECKERS)
def test_real_run_flips_on_python_version(
    tmp_path: Path, adapter_cls: type[Adapter], _: str
) -> None:
    (tmp_path / "main.py").write_text(VERSION_GATED_SNIPPET)
    adapter = adapter_cls()

    assert len(_run(adapter, str(tmp_path), "3.10")) >= 1
    assert _run(adapter, str(tmp_path), "3.13") == []
