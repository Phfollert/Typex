import subprocess
import time
from dataclasses import dataclass
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

    def run_mypy(self, program: str) -> TypeCheckResult:
        """
        Run mypy type checker on the given Python program string.

        Args:
            program: String representation of a Python program

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(["mypy", "-c", program], capture_output=True, text=True)
        return TypeCheckResult(
            checker="mypy",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_pyright(self, program: str) -> TypeCheckResult:
        """
        Run pyright type checker on the given Python program string.

        Args:
            program: String representation of a Python program

        Returns:
            TypeCheckResult with the output and exit code
        """
        # Pyright doesn't support -c flag, so we use stdin
        result = subprocess.run(
            ["pyright", "-"], input=program, capture_output=True, text=True
        )
        return TypeCheckResult(
            checker="pyright",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_ty(self, program: str) -> TypeCheckResult:
        """
        Run ty type checker (from Astral) on the given Python program string.

        Args:
            program: String representation of a Python program

        Returns:
            TypeCheckResult with the output and exit code
        """
        result = subprocess.run(
            ["ty", "check", program], capture_output=True, text=True
        )
        return TypeCheckResult(
            checker="ty",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_pyrefly(self, program: str) -> TypeCheckResult:
        """
        Run pyrefly type checker on the given Python program string.

        Args:
            program: String representation of a Python program

        Returns:
            TypeCheckResult with the output and exit code
        """
        # Assuming pyrefly supports -c flag similar to mypy
        result = subprocess.run(
            ["pyrefly", "-c", program], capture_output=True, text=True
        )
        return TypeCheckResult(
            checker="pyrefly",
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode,
        )

    def run_all(
        self,
        program: str,
        checkers: list[Literal["mypy", "ty", "pyright", "pyrefly"]] | None = None,
    ) -> dict[str, TypeCheckResult]:
        """
        Run specified type checkers on the given Python program string.

        Args:
            program: String representation of a Python program
            checkers: List of type checker names to run. If None, runs all checkers.

        Returns:
            Dictionary mapping checker name to TypeCheckResult
        """
        results = {}

        # Default to all checkers if none specified
        if checkers is None:
            checkers = ["mypy"]

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
                results[name] = checker_map[name](program)
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
