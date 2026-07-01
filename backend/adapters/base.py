from abc import ABC, abstractmethod
from pathlib import Path

from diagnostics import Diagnostic


def relpath(path: str, workspace_dir: str) -> str:
    """Make a checker-reported path relative to the workspace root.

    mypy/ty/pyrefly emit paths relative to the workspace (their cwd); pyright
    emits absolute paths. An absolute path outside the workspace (e.g. a stdlib
    or site-packages file) is kept absolute rather than mangled into `../../...`.
    """
    p = Path(path)
    if not p.is_absolute():
        return path
    base = Path(workspace_dir)
    if p.is_relative_to(base):
        return str(p.relative_to(base))
    return path


class Adapter(ABC):
    name: str

    @abstractmethod
    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        """Full argv to typecheck `workspace` at `target_python`, using
        `executable` (an absolute path from the registry)."""

    @abstractmethod
    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        """Parse the checker's stdout into normalized diagnostics."""

    def run_failed(self, returncode: int | None, stdout: str, stderr: str) -> bool:
        """True if the checker did not run to a normal conclusion, so `stdout` is
        not the diagnostics payload. Default: the exit code is neither 0 (clean)
        nor 1 (findings). Override for a checker with other codes, or one that
        signals failure through `stdout`/`stderr` rather than the exit code."""
        return returncode not in (0, 1)
