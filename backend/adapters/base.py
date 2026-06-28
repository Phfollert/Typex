import os
from abc import ABC, abstractmethod

from diagnostics import Diagnostic


def relpath(path: str, workspace_dir: str) -> str:
    """Make an checker reported path relative to the workspace root.

    mypy/ty/pyrefly emit paths relative to the workspace (their cwd); pyright
    emits absolute paths.
    """
    if not os.path.isabs(path):
        return path
    try:
        return os.path.relpath(path, workspace_dir)
    except ValueError:
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
