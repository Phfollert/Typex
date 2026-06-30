import hashlib

from utils.s3_object_store import ObjectStore, s3_store_from_env

# DO NOT CHANGE: the entropy (_ID_BYTES), the alphabet, and the fixed width
# (_ID_LENGTH) are part of the address recipe; changing any orphans every stored
# object. The id is fixed-width, case-sensitive base62 [0-9A-Za-z].
_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_ID_BYTES = 13  # 104 bits of sha256 - past any collision/second-preimage concern
_ID_LENGTH = 18  # base62 digits for 104 bits (62**18 > 2**104); ids are left-padded
_SHARE_BUCKET_ENV = "TYPEX_S3_BUCKET"


def content_id(payload: bytes) -> str:
    """Address a blob by its content: fixed-width base62 of the leading bytes of
    sha256(payload)."""
    value = int.from_bytes(hashlib.sha256(payload).digest()[:_ID_BYTES], "big")
    chars = ["0"] * _ID_LENGTH
    for i in range(_ID_LENGTH - 1, -1, -1):
        value, rem = divmod(value, 62)
        chars[i] = _ID_ALPHABET[rem]
    return "".join(chars)


class ShareStore:
    """Content-addressed view over a key-value object store: the key is
    `content_id(payload)`, so identical content dedups to the same id."""

    def __init__(self, store: ObjectStore) -> None:
        self._store = store

    async def put(self, payload: bytes) -> str:
        id = content_id(payload)
        await self._store.put(id, payload)
        return id

    async def get(self, id: str) -> bytes | None:
        return await self._store.get(id)

    def close(self) -> None:
        self._store.close()


def make_share_store() -> ShareStore:
    """Build the share-link store from env (the `TYPEX_S3_BUCKET` bucket)."""
    return ShareStore(s3_store_from_env(_SHARE_BUCKET_ENV))
