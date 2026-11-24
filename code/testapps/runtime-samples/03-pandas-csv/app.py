"""CSV analyzer — no requirements.txt. Deps should be discovered via import scan."""

import pandas as pd
import numpy as np
from flask import Flask, jsonify

app = Flask(__name__)


@app.route("/")
def index():
    # Create a sample DataFrame
    df = pd.DataFrame({
        "name": ["Alice", "Bob", "Charlie"],
        "score": [85, 92, 78],
        "grade": ["B", "A", "C"],
    })
    return jsonify({
        "rows": len(df),
        "mean_score": float(np.mean(df["score"])),
        "columns": list(df.columns),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
