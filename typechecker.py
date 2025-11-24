import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass
class TypeCheckResult:
    """Result from running a type checker."""

    checker: str
    stdout: str
    stderr: str
    returncode: int

    @property
    def success(self) -> bool:
        """Returns True if type checking passed without errors."""
        return self.returncode == 0


class TypeChecker:
    """Type checker interface for running various Python type checkers."""

    def __init__(self, program: str):
        """
        Initialize TypeChecker with a Python program string.
        Creates a temporary file with the program content.

        Args:
            program: String representation of a Python program
        """
        self.program = program
        # Create a temporary file that persists for the lifetime of this object
        self.temp_file = tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False
        )
        self.temp_file.write(program)
        self.temp_file.flush()
        self.file = self.temp_file.name

    def __del__(self):
        """Clean up temporary file when object is destroyed."""
        try:
            self.temp_file.close()
            Path(self.file).unlink(missing_ok=True)
        except Exception:
            pass

    def run_mypy(self) -> TypeCheckResult:
        """
        Run mypy type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(["mypy", self.file], capture_output=True, text=True)
        return TypeCheckResult(
            checker="mypy",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_pyright(self) -> TypeCheckResult:
        """
        Run pyright type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(["pyright", self.file], capture_output=True, text=True)
        return TypeCheckResult(
            checker="pyright",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_ty(self) -> TypeCheckResult:
        """
        Run ty type checker (from Astral) on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(
            ["ty", "check", self.file], capture_output=True, text=True
        )
        return TypeCheckResult(
            checker="ty",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_pyrefly(self) -> TypeCheckResult:
        """
        Run pyrefly type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(
            ["pyrefly", "check", self.file], capture_output=True, text=True
        )
        return TypeCheckResult(
            checker="pyrefly",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_all(
        self,
        checkers: list[Literal["mypy", "ty", "pyright", "pyrefly"]] | None = None,
    ) -> dict[str, TypeCheckResult]:
        """
        Run specified type checkers on the temporary file.

        Args:
            checkers: List of type checker names to run. If None, runs all checkers.

        Returns:
            Dictionary mapping checker name to TypeCheckResult
        """
        results = {}

        # Default to all checkers if none specified
        if checkers is None:
            checkers = ["mypy", "ty", "pyright", "pyrefly"]

        checker_map = {
            "mypy": self.run_mypy,
            "ty": self.run_ty,
            "pyright": self.run_pyright,
            "pyrefly": self.run_pyrefly,
        }

        start = time.time()
        for name in checkers:
            if name not in checker_map:
                results[name] = TypeCheckResult(
                    checker=name,
                    stdout="",
                    stderr=f"Unknown checker: {name}",
                    returncode=-1,
                )
                continue

            try:
                results[name] = checker_map[name]()
            except FileNotFoundError:
                # Checker not installed
                results[name] = TypeCheckResult(
                    checker=name,
                    stdout="",
                    stderr=f"{name} is not installed or not in PATH",
                    returncode=-1,
                )
        print(f"Type checking completed in {time.time() - start:.2f} seconds")

        return results
