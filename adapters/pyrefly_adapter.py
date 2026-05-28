import json

from adapters.base import Adapter, relpath
from diagnostics import Diagnostic, Severity

_SEVERITY = {
    "error": Severity.ERROR,
    "warning": Severity.WARNING,
    "warn": Severity.WARNING,
    "info": Severity.INFORMATION,
}


class PyreflyAdapter(Adapter):
    name = "pyrefly"

    def check_command(
        self, executable: str, target: str, python_version: str
    ) -> list[str]:
        return [
            executable,
            "check",
            "--output-format",
            "json",
            "--python-version",
            python_version,
            target,
        ]

    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        data = json.loads(stdout)
        diagnostics: list[Diagnostic] = []
        for d in data.get("errors", []):
            diagnostics.append(
                Diagnostic(
                    file=relpath(d["path"], workspace_dir),
                    line=d["line"],
                    column=d["column"],
                    end_line=d.get("stop_line", d["line"]),
                    end_column=d.get("stop_column", d["column"]),
                    severity=_SEVERITY.get(d.get("severity", "error"), Severity.ERROR),
                    message=d.get("description") or d.get("concise_description", ""),
                    code=d.get("name"),
                )
            )
        return diagnostics
