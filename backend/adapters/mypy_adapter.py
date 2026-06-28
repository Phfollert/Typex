import json
import re

from adapters.base import Adapter, relpath
from diagnostics import Diagnostic, Severity

_SEVERITY = {
    "error": Severity.ERROR,
    "warning": Severity.WARNING,
    "note": Severity.INFORMATION,
}


class MypyAdapter(Adapter):
    """mypy 1.11+, which supports `--output json`."""

    name = "mypy"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [
            executable,
            "--python-version",
            target_python,
            "--output",
            "json",
            "--no-error-summary",
            "--no-incremental",
            workspace,
        ]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
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
                    file=relpath(obj["file"], workspace),
                    line=obj["line"],
                    column=column + 1,
                    end_line=obj.get("end_line") or obj["line"],
                    end_column=end_column + 1,
                    severity=_SEVERITY.get(obj.get("severity", "error"), Severity.ERROR),
                    message=obj["message"],
                    code=obj.get("code"),
                )
            )
        return diagnostics


# `file:line:col:end_line:end_col: severity: message  [code]`
# Text columns are 1-based inclusive; we publish 1-based exclusive (the shared
# convention), so the end column gets +1.
_TEXT_RE = re.compile(
    r"^(?P<file>.+?):(?P<line>\d+):(?P<col>\d+):(?P<end_line>\d+):(?P<end_col>\d+): "
    r"(?P<sev>\w+): (?P<msg>.*?)(?:  \[(?P<code>[\w-]+)\])?$"
)


class MypyTextAdapter(Adapter):
    """mypy < 1.11, which predates `--output json` and only emits text."""

    name = "mypy-text"

    def check_command(
        self, executable: str, workspace: str, target_python: str
    ) -> list[str]:
        return [
            executable,
            "--python-version",
            target_python,
            "--no-error-summary",
            "--no-incremental",
            "--show-column-numbers",
            "--show-error-end",
            workspace,
        ]

    def normalize(self, stdout: str, workspace: str) -> list[Diagnostic]:
        diagnostics: list[Diagnostic] = []
        for line in stdout.splitlines():
            m = _TEXT_RE.match(line)
            if not m:
                continue
            diagnostics.append(
                Diagnostic(
                    file=relpath(m["file"], workspace),
                    line=int(m["line"]),
                    column=int(m["col"]),
                    end_line=int(m["end_line"]),
                    end_column=int(m["end_col"]) + 1,
                    severity=_SEVERITY.get(m["sev"], Severity.ERROR),
                    message=m["msg"],
                    code=m["code"],
                )
            )
        return diagnostics
