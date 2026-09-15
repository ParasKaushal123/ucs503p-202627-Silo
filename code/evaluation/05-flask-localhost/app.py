"""Flask app that binds to localhost — needs port auto-repair."""

from flask import Flask

app = Flask(__name__)


@app.route("/")
def hello():
    return "Hello! My localhost binding was auto-repaired by Silo."


@app.route("/status")
def status():
    return {"status": "running", "repaired": True}


if __name__ == "__main__":
    # This will be auto-repaired to 0.0.0.0 by Silo's port detection
    app.run(host="127.0.0.1", port=5000, debug=False)
