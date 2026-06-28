import pytest
from fastapi.testclient import TestClient

from app.app import app, get_checker_service
from diagnostics import Diagnostic, Severity
from registry import CheckerSpec
from runner import (
    CheckerOutputLimitError,
    CheckerResult,
    CheckerTimeoutError,
    WorkspacePathError,
)
from service import CheckerService

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


app.dependency_overrides[get_checker_service] = _fake_service
client = TestClient(app)


def test_list_checkers() -> None:
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


def test_typecheck_unknown_id_returns_404() -> None:
    resp = client.post(
        "/api/checkers/nope/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 404


def test_typecheck_known_id_returns_result() -> None:
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["checker"] == "fake"
    assert data["version"] == "1.0"
    assert data["diagnostics"][0]["message"] == "boom"


def test_typecheck_path_escape_returns_400_without_leaking() -> None:
    async def _raising_run(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise WorkspacePathError("path escapes workspace: '../escape.py'")

    app.dependency_overrides[get_checker_service] = lambda: CheckerService(
        specs=[FAKE_SPEC], run_fn=_raising_run
    )
    try:
        resp = client.post(
            "/api/checkers/fake-1.0/typecheck",
            json={"files": {"../escape.py": "x = 1\n"}, "python_version": "3.12"},
        )
    finally:
        app.dependency_overrides[get_checker_service] = _fake_service

    assert resp.status_code == 400
    assert "escape.py" not in resp.text
    assert "escapes workspace" not in resp.text


def test_typecheck_unhandled_error_returns_500_without_leaking() -> None:
    async def _boom(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise RuntimeError("secret internal detail")

    app.dependency_overrides[get_checker_service] = lambda: CheckerService(
        specs=[FAKE_SPEC], run_fn=_boom
    )
    safe_client = TestClient(app, raise_server_exceptions=False)
    try:
        resp = safe_client.post(
            "/api/checkers/fake-1.0/typecheck",
            json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
        )
    finally:
        app.dependency_overrides[get_checker_service] = _fake_service

    assert resp.status_code == 500
    assert "secret internal detail" not in resp.text


def test_typecheck_timeout_returns_500() -> None:
    async def _slow(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise CheckerTimeoutError("fake-1.0 exceeded 20s")

    app.dependency_overrides[get_checker_service] = lambda: CheckerService(
        specs=[FAKE_SPEC], run_fn=_slow
    )
    try:
        resp = client.post(
            "/api/checkers/fake-1.0/typecheck",
            json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
        )
    finally:
        app.dependency_overrides[get_checker_service] = _fake_service

    assert resp.status_code == 500


def test_typecheck_output_limit_returns_500() -> None:
    async def _flood(
        spec: CheckerSpec, files: dict[str, str], python_version: str
    ) -> CheckerResult:
        raise CheckerOutputLimitError("fake-1.0 exceeded 1048576 bytes of output")

    app.dependency_overrides[get_checker_service] = lambda: CheckerService(
        specs=[FAKE_SPEC], run_fn=_flood
    )
    try:
        resp = client.post(
            "/api/checkers/fake-1.0/typecheck",
            json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
        )
    finally:
        app.dependency_overrides[get_checker_service] = _fake_service

    assert resp.status_code == 500


def test_request_over_size_limit_returns_413(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.app.MAX_REQUEST_BYTES", 100)
    resp = client.post(
        "/api/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n" * 1000}, "python_version": "3.12"},
    )
    assert resp.status_code == 413
