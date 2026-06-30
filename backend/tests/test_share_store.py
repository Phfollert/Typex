import asyncio

from share_store import content_id, make_share_store


def test_content_id_is_deterministic() -> None:
    assert content_id(b"hello") == content_id(b"hello")


def test_content_id_differs_by_content() -> None:
    assert content_id(b"a") != content_id(b"b")


def test_share_round_trip() -> None:
    store = make_share_store()
    id = asyncio.run(store.put(b"integration-payload"))
    assert asyncio.run(store.get(id)) == b"integration-payload"


def test_share_same_content_same_id() -> None:
    store = make_share_store()
    first = asyncio.run(store.put(b"dedup-payload"))
    second = asyncio.run(store.put(b"dedup-payload"))
    assert first == second
