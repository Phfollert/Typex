"""Adapter tests, exercised only through real (provisioned) typechecker runs."""

import subprocess
from pathlib import Path

import pytest

from diagnostics import Diagnostic, Severity
from registry import CHECKERS, ADAPTERS, CheckerSpec

EXPECTED_CODE = {
    "mypy": "assignment",
    "pyright": "reportAssignmentType",
    "ty": "invalid-assignment",
    "pyrefly": "bad-assignment",
}

ASSIGNMENT_SNIPPET = "a: int = 2.0\nb: str = a + 1\n"
# typing.Self exists only in 3.11+, so this errors at 3.10 and passes at 3.13.
VERSION_GATED_SNIPPET = "from typing import Self\n\n\nclass C:\n    def clone(self) -> Self:\n        return self\n"


def _run(
    spec: CheckerSpec, workspace_dir: str, python_version: str = "3.12"
) -> list[Diagnostic]:
    adapter = ADAPTERS[spec.checker]
    out = subprocess.run(
        adapter.check_command(spec.executable, workspace_dir, python_version),
        capture_output=True,
        text=True,
    )
    return adapter.normalize(out.stdout, workspace_dir)


@pytest.mark.slow
@pytest.mark.parametrize("spec", CHECKERS, ids=[s.id for s in CHECKERS])
def test_real_run_normalizes_assignment_errors(
    tmp_path: Path, spec: CheckerSpec
) -> None:
    (tmp_path / "main.py").write_text(ASSIGNMENT_SNIPPET)
    diags = _run(spec, str(tmp_path))

    assert len(diags) == 2
    assert sorted(d.line for d in diags) == [1, 2]
    for d in diags:
        assert d.file == "main.py"
        assert d.severity == Severity.ERROR
        assert d.code == EXPECTED_CODE[spec.checker]
        assert d.column == 10


@pytest.mark.slow
@pytest.mark.parametrize("spec", CHECKERS, ids=[s.id for s in CHECKERS])
def test_real_run_flips_on_python_version(tmp_path: Path, spec: CheckerSpec) -> None:
    (tmp_path / "main.py").write_text(VERSION_GATED_SNIPPET)

    assert len(_run(spec, str(tmp_path), "3.10")) >= 1
    assert _run(spec, str(tmp_path), "3.13") == []
