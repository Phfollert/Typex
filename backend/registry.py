import tomllib
from dataclasses import dataclass
from pathlib import Path

from adapters.base import Adapter
from adapters.mypy_adapter import MypyAdapter
from adapters.pyright_adapter import PyrightAdapter
from adapters.pyrefly_adapter import PyreflyAdapter
from adapters.ty_adapter import TyAdapter

ROOT = Path(__file__).parent
VENVS_DIR = ROOT / ".venvs"
CONFIG_PATH = ROOT / "checkers.toml"

ADAPTERS: dict[str, Adapter] = {
    "mypy": MypyAdapter(),
    "pyright": PyrightAdapter(),
    "ty": TyAdapter(),
    "pyrefly": PyreflyAdapter(),
}


@dataclass(frozen=True)
class CheckerSpec:
    id: str
    checker: str
    version: str
    executable: str

    @property
    def label(self) -> str:
        return f"{self.checker} {self.version}"


def load_checkers(config_path: Path = CONFIG_PATH) -> list[CheckerSpec]:
    data = tomllib.loads(config_path.read_text())
    specs: list[CheckerSpec] = []
    for entry in data["checker"]:
        checker = entry["checker"]
        spec_id = entry["id"]
        executable = str(VENVS_DIR / spec_id / "bin" / checker)
        specs.append(
            CheckerSpec(
                id=spec_id,
                checker=checker,
                version=entry["version"],
                executable=executable,
            )
        )
    return specs


CHECKERS: list[CheckerSpec] = load_checkers()
CHECKERS_BY_ID: dict[str, CheckerSpec] = {spec.id: spec for spec in CHECKERS}
