"""Build the apps used by the evaluation test cases into testing/test-apps/.

    python testing/make_test_apps.py

TC-03 uses the Expense notes demo: v1 (clean), v2 (ten risks), v3 (v2 fixed).
TC-04 uses v1 plus a route that runs shell commands written to evade simple
pattern matching.
"""

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "test-apps"
DEMO = ROOT.parent / "testapps" / "security-demo"

V3_APP = '''import json
import os
import sqlite3
import subprocess

import requests
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
DB = "expenses.db"
RATES_URL = os.environ.get("RATES_URL", "https://api.exchangerates.example.com/latest")
RATES_API_KEY = os.environ.get("RATES_API_KEY", "")
# Only these fixed queries can run; the client picks one by name.
LIST_QUERIES = {
    "id": "SELECT id, title, amount FROM expenses ORDER BY id DESC",
    "amount": "SELECT id, title, amount FROM expenses ORDER BY amount DESC",
}


def db():
    conn = sqlite3.connect(DB)
    conn.execute("CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, title TEXT, amount REAL)")
    return conn


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/expenses")
def list_expenses():
    query = LIST_QUERIES.get(request.args.get("order", "id"), LIST_QUERIES["id"])
    rows = db().execute(query).fetchall()
    return jsonify([{"id": r[0], "title": r[1], "amount": r[2]} for r in rows])


@app.post("/api/expenses")
def add_expense():
    data = request.get_json()
    conn = db()
    conn.execute("INSERT INTO expenses (title, amount) VALUES (?, ?)", (data["title"], float(data["amount"])))
    conn.commit()
    return {"ok": True}, 201


@app.get("/api/convert")
def convert():
    currency = request.args.get("to", "EUR")
    rates = requests.get(RATES_URL, params={"key": RATES_API_KEY}, timeout=10).json()
    return {"rate": rates.get(currency)}


@app.get("/export")
def export_csv():
    result = subprocess.run(
        ["sqlite3", "-csv", DB, "select * from expenses"], capture_output=True, text=True
    )
    with open("export.csv", "w") as f:
        f.write(result.stdout)
    return {"file": "export.csv"}


@app.post("/backup/restore")
def restore():
    with open("backup.json", "w") as f:
        f.write(request.get_data(as_text=True))
    with open("backup.json") as f:
        rows = json.load(f)
    return {"restored": len(rows), "by": os.environ.get("USER", "unknown")}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
'''

V3_HTML = '''<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Expense notes</title>
<link rel="stylesheet" href="/static/style.css"></head>
<body>
<main>
  <h1>Expense notes</h1>
  <form id="add"><input name="title" placeholder="Coffee" required>
  <input name="amount" type="number" step="0.01" placeholder="3.50" required><button>Add</button></form>
  <div id="bars"></div>
  <ul id="list"></ul>
</main>
<script src="/static/app.js"></script>
</body>
</html>
'''

V3_JS = '''const list = document.querySelector("#list");
const bars = document.querySelector("#bars");

async function load() {
  const rows = await (await fetch("/api/expenses")).json();
  list.replaceChildren(...rows.map((r) => {
    const li = document.createElement("li");
    li.textContent = `${r.title}: ${r.amount.toFixed(2)}`;
    return li;
  }));
  const max = Math.max(1, ...rows.map((r) => r.amount));
  bars.replaceChildren(...rows.map((r) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = `${(r.amount / max) * 100}%`;
    bar.textContent = r.title;
    return bar;
  }));
}

document.querySelector("#add").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await fetch("/api/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: form.get("title"), amount: form.get("amount") }),
  });
  e.target.reset();
  load();
});

load();
'''

V3_CSS = (
    "body{font-family:system-ui;margin:0;background:#f8f9eb}main{max-width:640px;margin:48px auto;"
    "padding:0 20px}.bar{background:#aafdc0;margin:4px 0;padding:2px 6px;white-space:nowrap}\n"
)

HIDDEN_ROUTE = '''

import importlib
import subprocess as sp


@app.get("/admin/run")
def admin_run():
    cmd = request.args["cmd"]
    mod = importlib.import_module("sub" + "process")   # module name built from pieces
    getattr(mod, "run")(cmd, shell=True)               # function looked up by name
    __import__("os").system(cmd)                       # import inside the call
    sp.Popen(cmd, shell=True)                          # module renamed on import
    return {"ok": True}
'''


def read_zip(path: Path) -> dict[str, str]:
    with zipfile.ZipFile(path) as archive:
        return {name: archive.read(name).decode() for name in archive.namelist() if not name.endswith("/")}


def write_zip(path: Path, files: dict[str, str]) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    print("wrote", path.relative_to(ROOT.parent))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for version in ("v1", "v2"):
        shutil.copy(DEMO / f"expense-notes-{version}.zip", OUT / f"tc03-expense-notes-{version}.zip")
        print("copied", f"tc03-expense-notes-{version}.zip")
    v2 = read_zip(DEMO / "expense-notes-v2.zip")
    write_zip(OUT / "tc03-expense-notes-v3.zip", {
        **v2,
        "expense-notes/app.py": V3_APP,
        "expense-notes/templates/index.html": V3_HTML,
        "expense-notes/static/app.js": V3_JS,
        "expense-notes/static/style.css": V3_CSS,
    })
    v1 = read_zip(DEMO / "expense-notes-v1.zip")
    shutil.copy(DEMO / "expense-notes-v1.zip", OUT / "tc04-hidden-v1.zip")
    print("copied tc04-hidden-v1.zip")
    app = v1["expense-notes/app.py"].replace('\n\nif __name__ == "__main__":', HIDDEN_ROUTE + '\n\nif __name__ == "__main__":')
    write_zip(OUT / "tc04-hidden-v2.zip", {**v1, "expense-notes/app.py": app})


if __name__ == "__main__":
    main()
