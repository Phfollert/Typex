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

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [
            executable,
            "--outputjson",
            "--pythonversion",
            target_python,
            workspace,
        ]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        data = json.loads(stdout)
        diagnostics: list[Diagnostic] = []
        for d in data.get("generalDiagnostics", []):
            rng = d["range"]
            diagnostics.append(
                Diagnostic(
                    file=relpath(d["file"], workspace),
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
