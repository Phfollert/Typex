import codecs
from fastapi import FastAPI
from pydantic import BaseModel

from typechecker import ConcurrentTypechecking, Typechecker

app = FastAPI()


class CodeSnippet(BaseModel):
    code: str


class TypecheckerkDebugResponse(BaseModel):
    stdout: list[str]
    stderr: list[str]
    returncode: int


class TypecheckResponse(BaseModel):
    typecheckers: dict[str, TypecheckerkDebugResponse]


@app.get("/example")
async def typecheck():
    program = """
def greet(name: str) -> int:
    return "Hello, " + name
    """
    checker = ConcurrentTypechecking(program)
    results = await checker.run()
    responses = dict()
    for key in results:
        result = results[key]
        if isinstance(result, BaseException):
            responses[key] = TypecheckerkDebugResponse(
                stdout="",
                stderr=[str(result)],
                returncode=-1,
            )
        else:
            responses[key] = TypecheckerkDebugResponse(
                stdout=result.stdout.splitlines(),
                stderr=result.stderr.splitlines(),
                returncode=result.returncode,
            )
    return TypecheckResponse(typecheckers=responses)

