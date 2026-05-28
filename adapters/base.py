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
    """A typechecker adapter: knows how to invoke its checker and how to
    normalize that checker's raw stdout into a list of Diagnostic."""

    name: str

    @abstractmethod
    def version_command(self) -> list[str]:
        """Argv that prints the checker's version (e.g. ['mypy', '--version'])."""

    @abstractmethod
    def check_command(self, target: str, python_version: str) -> list[str]:
        """Full argv to typecheck `target` (a path) at the given Python version."""

    @abstractmethod
    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        """Parse the checker's stdout into normalized diagnostics."""
