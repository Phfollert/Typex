import pytest

from pathlib import Path

from registry import CheckerSpec, load_checkers
from service import CheckerService
from runner import CheckerResult


def _write_toml(tmp_path: Path, body: str) -> Path:
    p = tmp_path / "checkers.toml"
    p.write_text(body)
    return p


def test_load_checkers_reads_color(tmp_path: Path) -> None:
    cfg = _write_toml(
        tmp_path,
        '[[checker]]\nid = "mypy-1.0"\nchecker = "mypy"\nversion = "1.0"\ncolor = "#ef4444"\n',
    )
    specs = load_checkers(cfg)
    assert specs[0].color == "#ef4444"


def test_load_checkers_requires_color(tmp_path: Path) -> None:
    # A missing color is a hard error, not a silent default — an unassigned
    # color must be impossible.
    cfg = _write_toml(
        tmp_path,
        '[[checker]]\nid = "mypy-1.0"\nchecker = "mypy"\nversion = "1.0"\n',
    )
    with pytest.raises(ValueError, match="color"):
        load_checkers(cfg)


async def _noop_run(
    spec: CheckerSpec, files: dict[str, str], python_version: str
) -> CheckerResult:
    raise AssertionError("not called")


def test_service_list_includes_color(tmp_path: Path) -> None:
    cfg = _write_toml(
        tmp_path,
        '[[checker]]\nid = "ty-0.1"\nchecker = "ty"\nversion = "0.1"\ncolor = "#10b981"\n',
    )
    service = CheckerService(specs=load_checkers(cfg), run_fn=_noop_run)
    infos = service.list_checkers()
    assert infos[0].color == "#10b981"
