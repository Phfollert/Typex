import asyncio
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
            mode="w",
            suffix=".py",
        )
        self.temp_file.write(program)
        self.temp_file.flush()
        self.file = self.temp_file.name

    def __del__(self):
        """Close temporary file when object is destroyed."""
        self.temp_file.close()

    async def run_mypy(self) -> TypeCheckResult:
        """
        Run mypy type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        process = await asyncio.create_subprocess_exec(
            "mypy",
            self.file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return TypeCheckResult(
            checker="mypy",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode or 0,
        )

    async def run_pyright(self) -> TypeCheckResult:
        """
        Run pyright type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        process = await asyncio.create_subprocess_exec(
            "pyright",
            self.file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return TypeCheckResult(
            checker="pyright",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode or 0,
        )

    async def run_ty(self) -> TypeCheckResult:
        """
        Run ty type checker (from Astral) on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        process = await asyncio.create_subprocess_exec(
            "ty",
            "check",
            self.file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return TypeCheckResult(
            checker="ty",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode or 0,
        )

    async def run_pyrefly(self) -> TypeCheckResult:
        """
        Run pyrefly type checker on the temporary file.

        Returns:
            TypeCheckResult with the output and exit code
        """
        process = await asyncio.create_subprocess_exec(
            "pyrefly",
            "check",
            self.file,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        return TypeCheckResult(
            checker="pyrefly",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode or 0,
        )

    async def run_all(
        self,
        checkers: list[Literal["mypy", "ty", "pyright", "pyrefly"]] | None = None,
    ) -> dict[str, TypeCheckResult]:
        """
        Run specified type checkers on the temporary file concurrently.

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

        # Create tasks for all checkers to run concurrently
        tasks = []
        task_names = []

        for name in checkers:
            if name not in checker_map:
                results[name] = TypeCheckResult(
                    checker=name,
                    stdout="",
                    stderr=f"Unknown checker: {name}",
                    returncode=-1,
                )
            else:
                tasks.append(checker_map[name]())
                task_names.append(name)

        # Run all tasks concurrently
        if tasks:
            try:
                completed_results = await asyncio.gather(*tasks, return_exceptions=True)

                for name, result in zip(task_names, completed_results):
                    if isinstance(result, Exception):
                        # Handle exceptions (e.g., FileNotFoundError for missing checkers)
                        results[name] = TypeCheckResult(
                            checker=name,
                            stdout="",
                            stderr=f"{name} is not installed or not in PATH: {result}",
                            returncode=-1,
                        )
                    else:
                        results[name] = result
            except Exception as e:
                # Catch any unexpected errors
                for name in task_names:
                    if name not in results:
                        results[name] = TypeCheckResult(
                            checker=name,
                            stdout="",
                            stderr=f"Error running {name}: {e}",
                            returncode=-1,
                        )

        print(f"Type checking completed in {time.time() - start:.2f} seconds")

        return results
