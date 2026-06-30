import asyncio
from typing import cast

import pytest
from botocore.exceptions import EndpointConnectionError
from mypy_boto3_s3 import S3Client

from utils.s3_object_store import ObjectStoreError, S3ObjectStore, s3_store_from_env

_BUCKET_ENV = "TYPEX_S3_BUCKET"


def test_round_trip() -> None:
    store = s3_store_from_env(_BUCKET_ENV)
    asyncio.run(store.put("k-round-trip", b"payload"))
    assert asyncio.run(store.get("k-round-trip")) == b"payload"


def test_get_missing_returns_none() -> None:
    store = s3_store_from_env(_BUCKET_ENV)
    assert asyncio.run(store.get("k-missing")) is None


def test_wraps_connection_failure_as_store_error() -> None:
    # A connection-level boto3 failure is a BotoCoreError, not a service
    # ClientError; the store must still surface it as ObjectStoreError (-> 503).
    class _UnreachableClient:
        def put_object(self, **_: object) -> None:
            raise EndpointConnectionError(endpoint_url="http://unreachable")

    store = S3ObjectStore(cast(S3Client, _UnreachableClient()), "bucket")
    with pytest.raises(ObjectStoreError):
        asyncio.run(store.put("k", b"x"))


def test_close_shuts_down_executor() -> None:
    class _Client:
        def put_object(self, **_: object) -> None: ...

    store = S3ObjectStore(cast(S3Client, _Client()), "bucket")
    store.close()
    # The pool is gone, so scheduling further work fails.
    with pytest.raises(RuntimeError):
        asyncio.run(store.put("k", b"x"))
