"""Registry consistency checks (fast, no subprocess)."""

from registry import ADAPTERS, CHECKERS


def test_every_checker_resolves_to_a_registered_adapter() -> None:
    missing = {s.id: s.adapter for s in CHECKERS if s.adapter not in ADAPTERS}
    assert not missing, f"checkers whose `adapter` has no registered adapter: {missing}"
