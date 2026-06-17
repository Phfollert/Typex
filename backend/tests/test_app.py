from fastapi.testclient import TestClient

from app.app import app, get_checker_service
from diagnostics import Diagnostic, Severity
from registry import CheckerSpec
from runner import CheckerResult
from service import CheckerService

FAKE_SPEC = CheckerSpec(
    id="fake-1.0",
    checker="fake",
    version="1.0",
    executable="/nonexistent/fake",
    color="#000000",
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
        error=None,
        duration=0.01,
    )


def _fake_service() -> CheckerService:
    return CheckerService(specs=[FAKE_SPEC], run_fn=_fake_run)


app.dependency_overrides[get_checker_service] = _fake_service
client = TestClient(app)


def test_list_checkers() -> None:
    resp = client.get("/checkers")
    assert resp.status_code == 200
    assert resp.json() == [
        {"id": "fake-1.0", "checker": "fake", "version": "1.0", "label": "fake 1.0"}
    ]


def test_typecheck_unknown_id_returns_404() -> None:
    resp = client.post(
        "/checkers/nope/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 404


def test_typecheck_known_id_returns_result() -> None:
    resp = client.post(
        "/checkers/fake-1.0/typecheck",
        json={"files": {"main.py": "x = 1\n"}, "python_version": "3.12"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["checker"] == "fake"
    assert data["version"] == "1.0"
    assert data["diagnostics"][0]["message"] == "boom"
