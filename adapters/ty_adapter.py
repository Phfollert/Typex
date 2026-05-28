import json

from adapters.base import Adapter, relpath
from diagnostics import Diagnostic, Severity

_SEVERITY = {
    "blocker": Severity.ERROR,
    "critical": Severity.ERROR,
    "major": Severity.ERROR,
    "minor": Severity.WARNING,
    "info": Severity.INFORMATION,
}


class TyAdapter(Adapter):
    name = "ty"

    def version_command(self) -> list[str]:
        return ["ty", "--version"]

    def check_command(self, target: str, python_version: str) -> list[str]:
        return [
            "ty",
            "check",
            "--output-format",
            "gitlab",
            "--python-version",
            python_version,
            target,
        ]

    def normalize(self, stdout: str, workspace_dir: str) -> list[Diagnostic]:
        data = json.loads(stdout)
        diagnostics: list[Diagnostic] = []
        for d in data:
            pos = d["location"]["positions"]
            check_name = d.get("check_name")
            message = d.get("description", "")
            # ty prefixes its description with the check name; drop the
            # redundant prefix since we already expose it as `code`.
            if check_name and message.startswith(f"{check_name}: "):
                message = message[len(check_name) + 2 :]
            diagnostics.append(
                Diagnostic(
                    file=relpath(d["location"]["path"], workspace_dir),
                    line=pos["begin"]["line"],
                    column=pos["begin"]["column"],
                    end_line=pos["end"]["line"],
                    end_column=pos["end"]["column"],
                    severity=_SEVERITY.get(d.get("severity", "major"), Severity.ERROR),
                    message=message,
                    code=check_name,
                )
            )
        return diagnostics
