import asyncio
import os
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Protocol

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from mypy_boto3_s3 import S3Client


class ObjectStoreError(Exception):
    """The store backend failed for a reason other than a missing key."""


class ObjectStore(Protocol):
    async def put(self, key: str, payload: bytes) -> None: ...
    async def get(self, key: str) -> bytes | None: ...
    def close(self) -> None: ...


class S3ObjectStore:
    """Generic S3-compatible key-value blob store (any service exposing the S3 API).
    One bucket per domain; writes are immutable.

    boto3's client is synchronous, so each call runs in a dedicated per-instance
    `ThreadPoolExecutor` via `run_in_executor`, keeping the event loop unblocked."""

    def __init__(self, client: S3Client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket
        self._executor = ThreadPoolExecutor(thread_name_prefix="s3-store")

    async def _run[T](self, func: Callable[[], T]) -> T:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, func)

    async def put(self, key: str, payload: bytes) -> None:
        await self._run(partial(self._put, key, payload))

    def _put(self, key: str, payload: bytes) -> None:
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=payload,
                ContentType="application/octet-stream",
            )
        except (ClientError, BotoCoreError) as e:
            raise ObjectStoreError(str(e)) from e

    async def get(self, key: str) -> bytes | None:
        return await self._run(partial(self._get, key))

    def _get(self, key: str) -> bytes | None:
        try:
            resp = self._client.get_object(Bucket=self._bucket, Key=key)
        except self._client.exceptions.NoSuchKey:
            return None
        except (ClientError, BotoCoreError) as e:
            raise ObjectStoreError(str(e)) from e
        return resp["Body"].read()

    def close(self) -> None:
        self._executor.shutdown()


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} must be set")
    return value


def _make_s3_client(
    *, endpoint_url: str, region: str, access_key_id: str, secret_access_key: str
) -> S3Client:
    # boto3-stubs types the "s3" overload as S3Client, but pyright still marks the
    # call's result partially unknown; the annotated return type pins it.
    return boto3.client(  # pyright: ignore[reportUnknownMemberType]
        "s3",
        endpoint_url=endpoint_url,
        region_name=region,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
    )


def s3_store_from_env(bucket_env: str) -> S3ObjectStore:
    """Build an S3ObjectStore from the shared TYPEX_S3_* connection env plus the
    per-domain bucket env var named by `bucket_env`. All are required; a missing
    one raises."""
    bucket = _require_env(bucket_env)
    client = _make_s3_client(
        endpoint_url=_require_env("TYPEX_S3_ENDPOINT_URL"),
        region=_require_env("TYPEX_S3_REGION"),
        access_key_id=_require_env("TYPEX_S3_ACCESS_KEY_ID"),
        secret_access_key=_require_env("TYPEX_S3_SECRET_ACCESS_KEY"),
    )
    return S3ObjectStore(client, bucket)
