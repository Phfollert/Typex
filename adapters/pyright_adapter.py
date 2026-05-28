import json

from adapters.base import Adapter, relpath
from diagnostics import Diagnostic, Severity

_SEVERITY = {
    "error": Severity.ERROR,
    "warning": Severity.WARNING,
    "information": Severity.INFORMATION,
}


class PyrightAdapter(Adapter):
    name = "pyright"

    def version_command(self) -> list[str]:
        return ["pyright", "--version"]

    def check_command(self, target: str, python_version: str) -> list[str]:
        return [
            "pyright",
            "--outputjson",
            "--pythonversion",
            python_version,
            target,
        ]

    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        data = json.loads(stdout)
        diagnostics: list[Diagnostic] = []
        for d in data.get("generalDiagnostics", []):
            rng = d["range"]
            diagnostics.append(
                Diagnostic(
                    file=relpath(d["file"], workspace_dir),
                    line=rng["start"]["line"] + 1,
                    column=rng["start"]["character"] + 1,
                    end_line=rng["end"]["line"] + 1,
                    end_column=rng["end"]["character"] + 1,
                    severity=_SEVERITY.get(d.get("severity", "error"), Severity.ERROR),
                    message=d["message"],
                    code=d.get("rule"),
                )
            )
        return diagnostics
