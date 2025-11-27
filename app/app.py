from fastapi import FastAPI
from pydantic import BaseModel
import json
from typing import Literal
from typechecker import ConcurrentTypechecking

app = FastAPI()


class CodeSnippet(BaseModel):
    code: str


class TypecheckerkDebugResponse(BaseModel):
    stdout: dict | list | str | None
    stderr: dict | list | str | None
    returncode: int


class TypecheckResponse(BaseModel):
    code: str
    total_time: float
    typecheckers: dict[str, TypecheckerkDebugResponse | Literal["An error occurred"]]


@app.get("/example")
async def example():
    program = """def greet(name: str) -> int:
    return "Hello, " + name
    """
    checker = ConcurrentTypechecking(program)
    total_time, results = await checker.run()

    responses = dict()
    for key in results:
        result = results[key]
        if isinstance(result, BaseException):
            print(result)
            responses[key] = "An error occurred"
            continue

        try:
            responses[key] = TypecheckerkDebugResponse(
                stdout=json.loads(result.stdout) if result.stdout != "" else {},
                stderr=result.stderr,
                returncode=result.returncode,
            )
        except json.JSONDecodeError:
            responses[key] = TypecheckerkDebugResponse(
                stdout=result.stdout,
                stderr=result.stderr,
                returncode=result.returncode,
            )
    return TypecheckResponse(
        code=program, total_time=total_time, typecheckers=responses
    )


@app.post("/typecheck")
async def typecheck(code_snippet: CodeSnippet):
    checker = ConcurrentTypechecking(code_snippet.code)
    total_time, results = await checker.run()

    responses = dict()
    for key in results:
        result = results[key]
        if isinstance(result, BaseException):
            print(result)
            responses[key] = "An error occurred"
            continue

        try:
            responses[key] = TypecheckerkDebugResponse(
                stdout=json.loads(result.stdout) if result.stdout != "" else {},
                stderr=result.stderr,
                returncode=result.returncode,
            )
        except json.JSONDecodeError:
            responses[key] = TypecheckerkDebugResponse(
                stdout=result.stdout,
                stderr=result.stderr,
                returncode=result.returncode,
            )
    return TypecheckResponse(
        code=code_snippet.code, total_time=total_time, typecheckers=responses
    )
