import json

from adapters.base import Adapter, relpath
from diagnostics import Diagnostic, Severity

_SEVERITY = {
    "error": Severity.ERROR,
    "warning": Severity.WARNING,
    "note": Severity.INFORMATION,
}


class MypyAdapter(Adapter):
    name = "mypy"

    def check_command(
        self, executable: str, target: str, python_version: str
    ) -> list[str]:
        return [
            executable,
            "--python-version",
            python_version,
            "--output",
            "json",
            "--no-error-summary",
            "--no-incremental",
            target,
        ]

    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        diagnostics: list[Diagnostic] = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            column = obj.get("column", 0)
            end_column = obj.get("end_column", column)
            diagnostics.append(
                Diagnostic(
                    file=relpath(obj["file"], workspace_dir),
                    line=obj["line"],
                    column=column + 1,
                    end_line=obj.get("end_line") or obj["line"],
                    end_column=end_column + 1,
                    severity=_SEVERITY.get(
                        obj.get("severity", "error"), Severity.ERROR
                    ),
                    message=obj["message"],
                    code=obj.get("code"),
                )
            )
        return diagnostics
