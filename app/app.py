import json
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from diagnostics import Diagnostic
from registry import CHECKERS
from runner import run_checker
from service import CheckerInfo, CheckerService
from typechecker import ConcurrentTypechecking, Typechecker

app = FastAPI()


class TypecheckRequest(BaseModel):
    files: dict[str, str]
    python_version: str = "3.12"


class CheckerResultModel(BaseModel):
    checker: str
    version: str
    returncode: int | None
    diagnostics: list[Diagnostic]
    raw_stdout: str
    raw_stderr: str
    error: str | None
    duration: float


def get_checker_service() -> CheckerService:
    return CheckerService(specs=CHECKERS, run_fn=run_checker)


ServiceDep = Annotated[CheckerService, Depends(get_checker_service)]


@app.get("/api/checkers")
async def list_checkers(service: ServiceDep) -> list[CheckerInfo]:
    return service.list_checkers()


@app.post("/api/checkers/{checker_id}/typecheck")
async def typecheck(
    checker_id: str, request: TypecheckRequest, service: ServiceDep
) -> CheckerResultModel:
    spec = service.get(checker_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"unknown checker id: {checker_id}")
    result = await service.run(spec, request.files, request.python_version)
    return CheckerResultModel(
        checker=result.checker,
        version=result.version,
        returncode=result.returncode,
        diagnostics=result.diagnostics,
        raw_stdout=result.raw_stdout,
        raw_stderr=result.raw_stderr,
        error=result.error,
        duration=result.duration,
    )


class TypecheckDebugRequest(BaseModel):
    code_snippet: str
    typecheckers: set[Typechecker] | None = None


class TypecheckDebugResult(BaseModel):
    stdout: dict[str, Any] | list[Any] | str
    stderr: dict[str, Any] | list[Any] | str
    returncode: int | None


class TypecheckDebugResponse(BaseModel):
    code_snippet: str
    total_time: float
    results: dict[Typechecker, TypecheckDebugResult | Literal["An error occurred"]]


@app.get("/api/example-debug")
async def example_debug() -> TypecheckDebugResponse:
    program = """import requests
def greet(name: str) -> int:
    return "Hello, " + name
    """
    return await typecheck_debug(TypecheckDebugRequest(code_snippet=program))


@app.post("/api/typecheck-debug", response_model=TypecheckDebugResponse)
async def typecheck_debug(request: TypecheckDebugRequest) -> TypecheckDebugResponse:
    checker = ConcurrentTypechecking(
        request.code_snippet,
    )
    total_time, results = await checker.run(
        request.typecheckers if request.typecheckers else set()
    )
    responses: dict[
        Typechecker, TypecheckDebugResult | Literal["An error occurred"]
    ] = dict()
    for key in results:
        result = results[key]
        if isinstance(result, BaseException):
            print(result)
            responses[key] = "An error occurred"
            continue

        try:
            responses[key] = TypecheckDebugResult(
                stdout=json.loads(result.stdout) if result.stdout != "" else {},
                stderr=result.stderr,
                returncode=result.returncode,
            )
        except json.JSONDecodeError:
            responses[key] = TypecheckDebugResult(
                stdout=result.stdout,
                stderr=result.stderr,
                returncode=result.returncode,
            )
    return TypecheckDebugResponse(
        code_snippet=request.code_snippet, total_time=total_time, results=responses
    )


STATIC_DIR = Path("static")

app.mount(
    "/assets",
    StaticFiles(directory=STATIC_DIR / "assets", check_dir=False),
    name="assets",
)


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str) -> FileResponse:
    candidate = STATIC_DIR / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")

