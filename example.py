from typechecker import ConcurrentTypechecking, Typechecker
import codecs
import asyncio

if __name__ == "__main__":
    program = """
def greet(name: str) -> str:
    return "Hello, " + name
    """
    checker = ConcurrentTypechecking(program)
    results = asyncio.run(checker.run({Typechecker.TY, Typechecker.PYRIGHT}))
    decoded = codecs.decode(str(results), "unicode_escape")
    print(decoded)
