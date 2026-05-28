import os
from abc import ABC, abstractmethod

from diagnostics import Diagnostic


def relpath(path: str, workspace_dir: str) -> str:
    """Make an absolute checker-reported path relative to the workspace root."""
    try:
        return os.path.relpath(path, workspace_dir)
    except ValueError:
        return path


class Adapter(ABC):
    name: str

    @abstractmethod
    def check_command(
        self, executable: str, target: str, python_version: str
    ) -> list[str]:
        """Full argv to typecheck `target` at `python_version`, using the given
        checker executable (an absolute path from the registry)."""

    @abstractmethod
    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        """Parse the checker's stdout into normalized diagnostics."""
