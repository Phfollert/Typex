import json
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import RequestResponseEndpoint

from diagnostics import Diagnostic
from registry import CHECKERS
from runner import (
    CheckerOutputLimitError,
    CheckerTimeoutError,
    WorkspacePathError,
    run_checker,
)
from service import CheckerInfo, CheckerService
from typechecker import ConcurrentTypechecking, Typechecker

MAX_REQUEST_BYTES = 4 * 1024 * 1024
STATIC_DIR = Path("static")

router = APIRouter()


async def limit_request_size(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    content_length = request.headers.get("content-length")
    if content_length is not None and int(content_length) > MAX_REQUEST_BYTES:
        return JSONResponse(status_code=413, content={"detail": "request too large"})
    return await call_next(request)


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
    duration: float


def get_checker_service() -> CheckerService:
    return CheckerService(specs=CHECKERS, run_fn=run_checker)


ServiceDep = Annotated[CheckerService, Depends(get_checker_service)]


@router.get("/api/checkers")
async def list_checkers(service: ServiceDep) -> list[CheckerInfo]:
    return service.list_checkers()


@router.post("/api/checkers/{checker_id}/typecheck")
async def typecheck(
    checker_id: str, request: TypecheckRequest, service: ServiceDep
) -> CheckerResultModel:
    spec = service.get(checker_id)
    if spec is None:
        raise HTTPException(status_code=404, detail=f"unknown checker id: {checker_id}")
    try:
        result = await service.run(spec, request.files, request.python_version)
    except WorkspacePathError:
        raise HTTPException(status_code=400, detail="invalid file path in request")
    except CheckerTimeoutError:
        raise HTTPException(status_code=500, detail="checker timed out")
    except CheckerOutputLimitError:
        raise HTTPException(status_code=500, detail="checker output too large")
    return CheckerResultModel(
        checker=result.checker,
        version=result.version,
        returncode=result.returncode,
        diagnostics=result.diagnostics,
        raw_stdout=result.raw_stdout,
        raw_stderr=result.raw_stderr,
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


@router.get("/api/example-debug")
async def example_debug() -> TypecheckDebugResponse:
    program = """import requests
def greet(name: str) -> int:
    return "Hello, " + name
    """
    return await typecheck_debug(TypecheckDebugRequest(code_snippet=program))


@router.post("/api/typecheck-debug", response_model=TypecheckDebugResponse)
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


async def spa_fallback(full_path: str) -> FileResponse:
    candidate = STATIC_DIR / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")


def create_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(limit_request_size)
    app.include_router(router)
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets", check_dir=False),
        name="assets",
    )
    # Registered last so the SPA catch-all never shadows the API routes.
    app.get("/{full_path:path}")(spa_fallback)
    return app


app = create_app()
