"""Unit tests for the `relpath` helper (fast, no subprocess)."""

from adapters.base import relpath


def test_relpath_relativizes_paths_within_workspace() -> None:
    assert relpath("/ws/proj/main.py", "/ws/proj") == "main.py"
    assert relpath("/ws/proj/pkg/mod.py", "/ws/proj") == "pkg/mod.py"


def test_relpath_keeps_paths_outside_workspace_absolute() -> None:
    # A stdlib/site-packages path is not under the workspace; mangling it into
    # `../../usr/lib/...` would be misleading.
    out = relpath("/usr/lib/python3.12/typing.pyi", "/ws/proj")
    assert out == "/usr/lib/python3.12/typing.pyi"


def test_relpath_passes_through_relative_input() -> None:
    assert relpath("main.py", "/ws/proj") == "main.py"
