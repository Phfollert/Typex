import asyncio
import tempfile
import time
from dataclasses import dataclass
from typing import Literal
from enum import StrEnum


class Typechecker(StrEnum):
    MYPY = "mypy"
    TY = "ty"
    PYRIGHT = "pyright"
    PYREFLY = "pyrefly"


@dataclass
class TypecheckerkResult:
    """Result from running a type checker."""

    checker: str
    stdout: str
    stderr: str
    returncode: int | None = None

    @property
    def success(self) -> bool:
        """Returns True if type checking passed without errors."""
        return self.returncode == 0


class ConcurrentTypechecking:
    """Class for running various Python type checkers for the same input program."""

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

    async def _run_mypy(self) -> TypecheckerkResult:
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
        return TypecheckerkResult(
            checker="mypy",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode,
        )

    async def _run_pyright(self) -> TypecheckerkResult:
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
        return TypecheckerkResult(
            checker="pyright",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode,
        )

    async def _run_ty(self) -> TypecheckerkResult:
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
        return TypecheckerkResult(
            checker="ty",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode,
        )

    async def _run_pyrefly(self) -> TypecheckerkResult:
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
        return TypecheckerkResult(
            checker="pyrefly",
            stdout=stdout.decode(),
            stderr=stderr.decode(),
            returncode=process.returncode,
        )

    async def run(
        self, checkers: set[Typechecker] | Literal["all"] = "all"
    ) -> dict[Typechecker, TypecheckerkResult | BaseException]:
        """
        Run specified type checkers on the temporary file concurrently.

        Args:
            checkers: List of type checker names to run. If None, runs all checkers.

        Returns:
            Dictionary mapping checker name to TypeCheckResult
        """
        results = {}

        # Default to all checkers if none specified
        if checkers == "all":
            checkers = {
                Typechecker.MYPY,
                Typechecker.TY,
                Typechecker.PYRIGHT,
                Typechecker.PYREFLY,
            }

        checker_map = {
            Typechecker.MYPY: self._run_mypy,
            Typechecker.TY: self._run_ty,
            Typechecker.PYRIGHT: self._run_pyright,
            Typechecker.PYREFLY: self._run_pyrefly,
        }

        start = time.time()

        # Create tasks for all checkers to run concurrently
        tasks = []

        for name in checkers:
            tasks.append(checker_map[name]())

        # Run all tasks concurrently
        if tasks:
            completed_results = await asyncio.gather(*tasks, return_exceptions=True)

            for name, result in zip(checkers, completed_results):
                results[name] = result

        print(f"Type checking completed in {time.time() - start:.2f} seconds")

        return results
