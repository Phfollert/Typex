from collections.abc import Awaitable, Callable

from pydantic import BaseModel

from registry import CheckerSpec
from runner import CheckerResult

RunFn = Callable[[CheckerSpec, dict[str, str], str], Awaitable[CheckerResult]]


class CheckerInfo(BaseModel):
    id: str
    checker: str
    version: str
    label: str


class CheckerService:
    def __init__(self, specs: list[CheckerSpec], run_fn: RunFn) -> None:
        self.run_fn = run_fn
        self.specs: dict[str, CheckerSpec] = {s.id: s for s in specs}

    def get(self, checker_id: str) -> CheckerSpec | None:
        return self.specs.get(checker_id)

    def list_checkers(self) -> list[CheckerInfo]:
        return [
            CheckerInfo(id=s.id, checker=s.checker, version=s.version, label=s.label)
            for s in self.specs.values()
        ]

    async def run(
        self, spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        return await self.run_fn(spec, files, python_version)
