"""Fast unit tests for the two mypy adapters (no subprocess)."""

import os

from adapters.mypy_adapter import MypyAdapter, MypyTextAdapter
from diagnostics import Severity


def test_json_adapter_requests_json_output() -> None:
    cmd = MypyAdapter().check_command("mypy", "/ws", "3.12")
    assert "--output" in cmd and "json" in cmd
    assert "--show-error-end" not in cmd


def test_both_adapters_ignore_user_config() -> None:
    # `--config-file=os.devnull` keeps mypy from reading any discovered config
    # (plugins / mypy_path).
    for cmd in (
        MypyAdapter().check_command("mypy", "/ws", "3.12"),
        MypyTextAdapter().check_command("mypy", "/ws", "3.12"),
    ):
        assert "--config-file" in cmd
        assert os.devnull in cmd


def test_text_adapter_requests_text_output() -> None:
    cmd = MypyTextAdapter().check_command("mypy", "/ws", "3.12")
    assert "--show-column-numbers" in cmd and "--show-error-end" in cmd
    assert "--output" not in cmd


def test_text_adapter_parses_position_code_and_strips_code_suffix() -> None:
    stdout = (
        "main.py:1:10:1:12: error: Incompatible types in assignment "
        '(expression has type "float", variable has type "int")  [assignment]\n'
    )
    d = MypyTextAdapter().normalize(stdout, "/ws")[0]
    # text end column is 1-based inclusive (12); we publish 1-based exclusive (13)
    assert (d.line, d.column, d.end_line, d.end_column) == (1, 10, 1, 13)
    assert d.severity == Severity.ERROR
    assert d.code == "assignment"
    assert d.file == "main.py"
    assert "Incompatible types" in d.message and "[assignment]" not in d.message


def test_text_adapter_handles_note_without_code() -> None:
    stdout = 'main.py:3:5:3:9: note: Revealed type is "builtins.int"\n'
    d = MypyTextAdapter().normalize(stdout, "/ws")[0]
    assert d.severity == Severity.INFORMATION
    assert d.code is None
