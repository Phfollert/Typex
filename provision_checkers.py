"""Build one isolated venv per entry in checkers.toml.

Run this once after editing checkers.toml:  uv run python provision_checkers.py
"""

import subprocess

from registry import CHECKERS, VENVS_DIR


def provision() -> None:
    for spec in CHECKERS:
        venv = VENVS_DIR / spec.id
        print(f"provisioning {spec.id} ...")
        subprocess.run(["uv", "venv", str(venv)], check=True)
        subprocess.run(
            [
                "uv",
                "pip",
                "install",
                "--python",
                str(venv / "bin" / "python"),
                f"{spec.checker}=={spec.version}",
            ],
            check=True,
        )


if __name__ == "__main__":
    provision()
