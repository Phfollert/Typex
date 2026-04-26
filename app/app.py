from fastapi import FastAPI
from pydantic import BaseModel
import json
from typing import Literal
from typechecker import ConcurrentTypechecking, Typechecker

app = FastAPI()


class TypecheckDebugRequest(BaseModel):
    code_snippet: str
    typecheckers: set[Typechecker] | None = None


class TypecheckDebugResult(BaseModel):
    stdout: dict | list | str
    stderr: dict | list | str
    returncode: int | None


class TypecheckDebugResponse(BaseModel):
    code_snippet: str
    total_time: float
    results: dict[Typechecker, TypecheckDebugResult | Literal["An error occurred"]]


@app.get("/example-debug")
async def example_debug():
    program = """import requests
def greet(name: str) -> int:
    return "Hello, " + name
    """
    return await typecheck_debug(TypecheckDebugRequest(code_snippet=program))


@app.post("/typecheck-debug", response_model=TypecheckDebugResponse)
async def typecheck_debug(request: TypecheckDebugRequest):
    checker = ConcurrentTypechecking(
        request.code_snippet,
    )
    total_time, results = await checker.run(
        request.typecheckers if request.typecheckers else set()
    )
    responses: dict[
        Typechecker, TypecheckDebugResult | Literal["An error occurred"]
    ] = dict()
    for key in results:
        result = results[key]
        if isinstance(result, BaseException):
            print(result)
            responses[key] = "An error occurred"
            continue

        try:
            responses[key] = TypecheckDebugResult(
                stdout=json.loads(result.stdout) if result.stdout != "" else {},
                stderr=result.stderr,
                returncode=result.returncode,
            )
        except json.JSONDecodeError:
            responses[key] = TypecheckDebugResult(
                stdout=result.stdout,
                stderr=result.stderr,
                returncode=result.returncode,
            )
    return TypecheckDebugResponse(
        code_snippet=request.code_snippet, total_time=total_time, results=responses
    )
