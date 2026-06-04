from enum import StrEnum

from pydantic import BaseModel


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    INFORMATION = "information"


class Diagnostic(BaseModel):
    """One normalized diagnostic, shared across all checker adapters.

    Positions are 1-based for both line and column.
    `file` is relative to the workspace root (e.g. "main.py").
    """

    file: str
    line: int
    column: int
    end_line: int
    end_column: int
    severity: Severity
    message: str
    code: str | None = None
