from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def root():
    return {"message": "FastAPI Calculator"}


@app.get("/add/{a}/{b}")
def add(a: int, b: int):
    return {"result": a + b}


@app.get("/multiply/{a}/{b}")
def multiply(a: int, b: int):
    return {"result": a * b}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
