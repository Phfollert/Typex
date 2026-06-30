from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import RequestResponseEndpoint

from diagnostics import Diagnostic
from share_store import ShareStore, make_share_store
from registry import CHECKERS
from utils.s3_object_store import ObjectStoreError
from runner import (
    NormalizationError,
    CheckerOutputLimitError,
    CheckerTimeoutError,
    UnsupportedFileError,
    WorkspacePathError,
    run_checker,
)
from service import CheckerInfo, CheckerService

MAX_REQUEST_BYTES = 4 * 1024 * 1024
MAX_SHARE_BYTES = 256 * 1024
SHARE_CACHE_CONTROL = "public, max-age=31536000, immutable"
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
    duration: float


def get_checker_service() -> CheckerService:
    return CheckerService(specs=CHECKERS, run_fn=run_checker)


ServiceDep = Annotated[CheckerService, Depends(get_checker_service)]

def get_share_store(request: Request) -> ShareStore:
    store: ShareStore = request.app.state.share_store
    return store


ShareStoreDep = Annotated[ShareStore, Depends(get_share_store)]


class ShareCreateResponse(BaseModel):
    id: str
    url: str


class ShareGetResponse(BaseModel):
    payload: str


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
    except UnsupportedFileError:
        raise HTTPException(status_code=400, detail="only .py/.pyi files are allowed")
    except CheckerTimeoutError:
        raise HTTPException(status_code=500, detail="checker timed out")
    except CheckerOutputLimitError:
        raise HTTPException(status_code=500, detail="checker output too large")
    except NormalizationError:
        raise HTTPException(status_code=500, detail="could not parse checker output")
    return CheckerResultModel(
        checker=result.checker,
        version=result.version,
        returncode=result.returncode,
        diagnostics=result.diagnostics,
        duration=result.duration,
    )


@router.post("/api/share")
async def create_share(request: Request, store: ShareStoreDep) -> ShareCreateResponse:
    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="empty share payload")
    if len(payload) > MAX_SHARE_BYTES:
        raise HTTPException(status_code=413, detail="share payload too large")
    # The store is opaque, but a share blob is the frontend's base64url codec text;
    # rejecting non-ASCII here keeps the read side (which serves it as a JSON string)
    # total instead of poisoning an id with a value that 500s on every GET.
    try:
        payload.decode("ascii")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="share payload must be ascii")
    try:
        id = await store.put(payload)
    except ObjectStoreError:
        raise HTTPException(status_code=503, detail="share storage unavailable")
    return ShareCreateResponse(id=id, url=f"/s/{id}")


@router.get("/api/share/{id}")
async def get_share(id: str, store: ShareStoreDep, response: Response) -> ShareGetResponse:
    try:
        payload = await store.get(id)
    except ObjectStoreError:
        raise HTTPException(status_code=503, detail="share storage unavailable")
    if payload is None:
        raise HTTPException(status_code=404, detail="share not found")
    response.headers["Cache-Control"] = SHARE_CACHE_CONTROL
    return ShareGetResponse(payload=payload.decode("utf-8"))


async def spa_fallback(full_path: str) -> FileResponse:
    candidate = STATIC_DIR / full_path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(STATIC_DIR / "index.html")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Build the store at startup; shut its thread pool down on teardown.
    store = make_share_store()
    app.state.share_store = store
    try:
        yield
    finally:
        store.close()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
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
