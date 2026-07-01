import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.app import create_app, get_checker_service, get_share_store
from share_store import make_share_store
from utils.s3_object_store import ObjectStoreError
from diagnostics import Diagnostic, Severity
from registry import CheckerSpec
from runner import (
    NormalizationError,
    CheckerFailedError,
    CheckerOutputLimitError,
    CheckerResult,
    CheckerTimeoutError,
    UnsupportedFileError,
    WorkspacePathError,
)
from service import CheckerService, RunFn

FAKE_SPEC = CheckerSpec(
    id="fake-1.0",
    checker="fake",
    version="1.0",
    executable="/nonexistent/fake",
    color="#000000",
    adapter="fake",
)


async def _fake_run(
    spec: CheckerSpec, files: dict[str, str], python_version: str
) -> CheckerResult:
    return CheckerResult(
        checker=spec.checker,
        version=spec.version,
        returncode=1,
        diagnostics=[
            Diagnostic(
                file="main.py",
                line=1,
                column=1,
                end_line=1,
                end_column=2,
                severity=Severity.ERROR,
                message="boom",
                code="rule",
            )
        ],
        raw_stdout="",
        raw_stderr="",
        duration=0.01,
    )


def _fake_service() -> CheckerService:
    return CheckerService(specs=[FAKE_SPEC], run_fn=_fake_run)


@pytest.fixture
def app_() -> FastAPI:
    test_app = create_app()
    test_app.dependency_overrides[get_checker_service] = _fake_service
    return test_app


@pytest.fixture
def client(app_: FastAPI) -> TestClient:
    return TestClient(app_)


def _override_run(app_: FastAPI, run_fn: RunFn) -> None:
    app_.dependency_overrides[get_checker_service] = lambda: CheckerService(
        specs=[FAKE_SPEC], run_fn=run_fn
    )


def test_list_checkers(client: TestClient) -> None:
    resp = client.get("/api/checkers")
    assert resp.status_code == 200
    assert resp.json() == [
        {
            "id": "fake-1.0",
            "checker": "fake",
            "version": "1.0",
            "label": "fake 1.0",
            "color": "#000000",
        }
    ]


def test_typecheck_unknown_id_returns_404(client: TestClient) -> None:
    resp = client.post(
        "/api/checkers/nope/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 404


def test_typecheck_known_id_returns_result(client: TestClient) -> None:
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["checker"] == "fake"
    assert data["version"] == "1.0"
    assert data["diagnostics"][0]["message"] == "boom"


def test_typecheck_path_escape_returns_400_without_leaking(
    app_: FastAPI, client: TestClient
) -> None:
    async def _raising_run(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise WorkspacePathError("path escapes workspace: '../escape.py'")

    _override_run(app_, _raising_run)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"../escape.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 400
    assert "escape.py" not in resp.text
    assert "escapes workspace" not in resp.text


def test_typecheck_unsupported_file_returns_400(
    app_: FastAPI, client: TestClient
) -> None:
    async def _reject(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise UnsupportedFileError("unsupported file type: 'mypy.ini'")

    _override_run(app_, _reject)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"mypy.ini": "[mypy]\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 400


def test_typecheck_unhandled_error_returns_500_without_leaking(app_: FastAPI) -> None:
    async def _boom(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise RuntimeError("secret internal detail")

    _override_run(app_, _boom)
    safe_client = TestClient(app_, raise_server_exceptions=False)
    resp = safe_client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 500
    assert "secret internal detail" not in resp.text


def test_typecheck_timeout_returns_500(app_: FastAPI, client: TestClient) -> None:
    async def _slow(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise CheckerTimeoutError("fake-1.0 exceeded 20s")

    _override_run(app_, _slow)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 500


def test_typecheck_output_limit_returns_500(app_: FastAPI, client: TestClient) -> None:
    async def _flood(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise CheckerOutputLimitError("fake-1.0 exceeded 1048576 bytes of output")

    _override_run(app_, _flood)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 500


def test_typecheck_checker_exit_returns_500_without_leaking(app_: FastAPI) -> None:
    async def _exited(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise CheckerFailedError("fake-1.0 exited with code 2")

    _override_run(app_, _exited)
    client = TestClient(app_)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 500
    assert "exited with code" not in resp.text


def test_typecheck_normalization_error_returns_500(
    app_: FastAPI, client: TestClient
) -> None:
    async def _bad_output(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise NormalizationError("fake-1.0 produced unparseable output (returncode 1)")

    _override_run(app_, _bad_output)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )

    assert resp.status_code == 500


def test_request_over_size_limit_returns_413(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.app.MAX_REQUEST_BYTES", 100)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n" * 1000}, "python_version": "3.12"},
    )
    assert resp.status_code == 413


@pytest.fixture
def share_client(app_: FastAPI) -> TestClient:
    store = make_share_store()
    app_.dependency_overrides[get_share_store] = lambda: store
    return TestClient(app_)


def test_share_round_trip(share_client: TestClient) -> None:
    created = share_client.post("/api/share", content=b"1deadbeef")
    assert created.status_code == 200
    body = created.json()
    assert body["url"] == f"/s/{body['id']}"

    fetched = share_client.get(f"/api/share/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json() == {"payload": "1deadbeef"}
    assert "immutable" in fetched.headers["cache-control"]


def test_share_same_payload_same_id(share_client: TestClient) -> None:
    first = share_client.post("/api/share", content=b"1same").json()
    second = share_client.post("/api/share", content=b"1same").json()
    assert first["id"] == second["id"]


def test_share_empty_payload_returns_400(share_client: TestClient) -> None:
    assert share_client.post("/api/share", content=b"").status_code == 400


def test_share_oversize_returns_413(
    share_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.app.MAX_SHARE_BYTES", 10)
    resp = share_client.post("/api/share", content=b"x" * 11)
    assert resp.status_code == 413


def test_share_rejects_non_ascii(share_client: TestClient) -> None:
    resp = share_client.post("/api/share", content=b"\xff\xfe")
    assert resp.status_code == 400


def test_share_unknown_id_returns_404(share_client: TestClient) -> None:
    assert share_client.get("/api/share/doesnotexist").status_code == 404


class _RaisingStore:
    async def put(self, payload: bytes) -> str:
        raise ObjectStoreError("backend unavailable")

    async def get(self, id: str) -> bytes | None:
        raise ObjectStoreError("backend unavailable")


def test_share_storage_error_maps_to_503(app_: FastAPI) -> None:
    app_.dependency_overrides[get_share_store] = lambda: _RaisingStore()
    client = TestClient(app_)
    assert client.post("/api/share", content=b"1ok").status_code == 503
    assert client.get("/api/share/anyid").status_code == 503
