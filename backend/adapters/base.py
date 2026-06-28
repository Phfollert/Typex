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
