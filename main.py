from typechecker import TypeChecker
import codecs
import asyncio

if __name__ == "__main__":
    # Example: pass a Python program as a string
    with open("example.py", "r") as f:
        program = f.read()
    checker = TypeChecker(program)
    results = asyncio.run(checker.run_all())
    decoded = codecs.decode(str(results), "unicode_escape")
    print(decoded)
