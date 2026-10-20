"""Security track: what each build can do, what it depends on, and what changed.

Everything here is deterministic. Findings come from rules: Semgrep with the
rules in ``data/semgrep/silo-rules.yml`` when the ``semgrep`` CLI is installed,
plus Silo's built-in AST and pattern rules, which always run. A language model
is never consulted to decide what a build can do or whether it is risky.

The capability label ("nutrition label") follows the categories of the
original architecture: outbound network (with hosts), sockets, filesystem
read and write, subprocesses, environment and secrets, databases, and, for
browser code, remote scripts, storage and device access.
"""

from __future__ import annotations

import ast
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from collections import OrderedDict
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from .packaging import IMPORT_TO_PACKAGE, STDLIB
from .workspace import MAX_TEXT, SENSITIVE

MAX_FILES = 600
SEVERITY_WEIGHT = {"high": 10, "medium": 4, "low": 1, "info": 0}
SEVERITY_ORDER = ["high", "medium", "low", "info"]
RULES_FILE = Path(__file__).resolve().parents[2] / "data" / "semgrep" / "silo-rules.yml"
TEXT_SUFFIXES = {
    ".py",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".htm",
    ".css",
    ".json",
    ".toml",
    ".txt",
    ".md",
    ".yml",
    ".yaml",
    ".cfg",
    ".ini",
    ".env.example",
    ".sh",
    ".sql",
    ".jinja",
    ".j2",
    "",
}
# Files Silo itself writes into an upload while building; not the author's code.
GENERATED = {".dockerignore", "docker-compose.silo.yml"}
DOCKERFILE_SIGNATURE = "PIP_DISABLE_PIP_VERSION_CHECK=1"

CAPABILITY_LABELS = {
    "serve": "Serves a web interface",
    "network": "Sends data to external servers",
    "socket": "Opens raw network connections",
    "fs-read": "Reads files on the server",
    "fs-write": "Writes files on the server",
    "process": "Runs system commands",
    "env": "Reads environment variables and secrets",
    "database": "Connects to a database",
    "remote-script": "Loads code from other websites",
    "storage": "Stores data in the visitor's browser",
    "device": "Asks for camera, microphone or location",
}
CAPABILITY_VERBS = {  # for sentences: "this build can now <verb>"
    "serve": "serve a web interface",
    "network": "send data to external servers",
    "socket": "open raw network connections",
    "fs-read": "read files on the server",
    "fs-write": "write files on the server",
    "process": "run system commands",
    "env": "read environment variables and secrets",
    "database": "connect to a database",
    "remote-script": "load code from other websites",
    "storage": "store data in the visitor's browser",
    "device": "ask for camera, microphone or location",
}
CAPABILITY_TONE = {  # how much a capability widens what the app can reach
    "serve": "low",
    "fs-read": "low",
    "env": "medium",
    "storage": "low",
    "database": "medium",
    "fs-write": "medium",
    "network": "medium",
    "remote-script": "medium",
    "device": "medium",
    "socket": "high",
    "process": "high",
}


# ---------------------------------------------------------------------------
# Reading a build's source
# ---------------------------------------------------------------------------


def files_from_directory(directory: Path) -> dict[str, str]:
    """Text files of an upload, skipping secrets, dependencies and Silo's own output."""
    files: dict[str, str] = {}
    if not directory.is_dir():
        return files
    for path in sorted(directory.rglob("*")):
        if len(files) >= MAX_FILES:
            break
        if not path.is_file() or path.is_symlink():
            continue
        rel = path.relative_to(directory)
        if any(p.lower() in SENSITIVE or p.startswith(".env") for p in rel.parts):
            continue
        if rel.name in GENERATED or path.stat().st_size > MAX_TEXT:
            continue
        suffix = path.suffix.lower()
        if suffix not in TEXT_SUFFIXES and rel.name not in {"Dockerfile", "Procfile"}:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeError, OSError):
            continue
        if rel.name == "Dockerfile" and DOCKERFILE_SIGNATURE in content:
            continue
        if "\x00" not in content:
            files[rel.as_posix()] = content
    # A single wrapper folder (zip of a directory) is not part of the paths.
    parts = [PurePosixPath(p).parts for p in files]
    if parts and all(len(p) > 1 and p[0] == parts[0][0] for p in parts):
        files = {"/".join(PurePosixPath(p).parts[1:]): c for p, c in files.items()}
    return files


def files_from_release(files_json: str) -> dict[str, str]:
    return {f["path"]: f["content"] for f in json.loads(files_json or "{}").values()}


def digest_files(files: dict[str, str]) -> str:
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

SECRET_PATTERNS = [
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS access key"),
    (re.compile(r"AIza[0-9A-Za-z_\-]{35}"), "Google API key"),
    (re.compile(r"sk-[A-Za-z0-9]{24,}"), "API secret key"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}"), "GitHub token"),
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"), "private key"),
]
SECRET_NAME = re.compile(r"(secret|passw(or)?d|api_?key|token|private_?key)", re.IGNORECASE)

JS_RULES = [
    # (rule id, compiled pattern, severity, cwe, title, why, fix)
    (
        "silo.js.eval",
        re.compile(r"\beval\s*\(|\bnew\s+Function\s*\("),
        "high",
        "CWE-95",
        "Runs text as code",
        "eval() or new Function() turns data into running code; anything an attacker can put "
        "into that text runs in the visitor's browser.",
        "Parse the data instead (JSON.parse) or call a known function directly.",
    ),
    (
        "silo.js.html-injection",
        re.compile(r"\.(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(|document\.write\s*\("),
        "medium",
        "CWE-79",
        "Writes raw HTML into the page",
        "Text inserted as HTML can carry scripts (cross-site scripting) if any part of it "
        "comes from a user, a URL or an API.",
        "Use textContent for text, or build elements with document.createElement.",
    ),
    (
        "silo.js.token-in-storage",
        re.compile(
            r"(localStorage|sessionStorage)\.setItem\s*\(\s*['\"][^'\"]*(token|jwt|auth|session|password)",
            re.IGNORECASE,
        ),
        "medium",
        "CWE-922",
        "Keeps a credential in browser storage",
        "Any script on the page can read localStorage, so one injected script steals the "
        "credential.",
        "Keep sessions in HttpOnly cookies set by the server.",
    ),
    (
        "silo.js.postmessage-any-origin",
        re.compile(r"postMessage\s*\([^)]*,\s*['\"]\*['\"]\s*\)"),
        "low",
        "CWE-345",
        "Sends messages to any window",
        "postMessage with '*' lets whichever page is listening read the message.",
        "Pass the exact target origin instead of '*'.",
    ),
    (
        "silo.js.insecure-request",
        re.compile(r"(fetch|axios\.\w+|open)\s*\(\s*['\"]http://(?!localhost|127\.0\.0\.1)"),
        "low",
        "CWE-319",
        "Fetches over plain HTTP",
        "Data sent or received over http:// can be read or altered on the network.",
        "Use https://.",
    ),
]

HTML_SCRIPT = re.compile(
    r"<script\b([^>]*)\bsrc=['\"](https?://[^'\"]+)['\"]([^>]*)>", re.IGNORECASE
)


def _finding(rule_id, severity, cwe, title, file, line, snippet, why, fix, engine="silo"):
    return {
        "rule_id": rule_id,
        "severity": severity,
        "cwe": cwe,
        "title": title,
        "file": file,
        "line": line,
        "snippet": snippet.strip()[:240],
        "why": why,
        "fix": fix,
        "engine": engine,
    }


def _mask(text: str, literals: bool = False) -> str:
    """Never echo a discovered secret back into the UI.

    Known key formats are always hidden; `literals` also hides quoted strings,
    for lines that assign a secret to a variable.
    """
    for pattern, _ in SECRET_PATTERNS:
        text = pattern.sub(lambda m: m.group(0)[:4] + "…" + "•" * 6, text)
    if not literals:
        return text
    return re.sub(r"(['\"])([^'\"]{4})[^'\"]{4,}(['\"])", r"\1\2••••••\3", text)


def _dotted(node) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _dotted(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    if isinstance(node, ast.Call):
        return _dotted(node.func)
    return ""


def _keyword(call: ast.Call, name: str):
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    return None


def _is_true(node) -> bool:
    return isinstance(node, ast.Constant) and node.value is True


def _first_string(call: ast.Call) -> str | None:
    if call.args and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str):
        return call.args[0].value
    return None


def _constant_text(node) -> str | None:
    """The string an expression always evaluates to, if it is built only from literals:
    "sub" + "process", f"sub{'process'}", "".join(["sub", "process"])."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = _constant_text(node.left), _constant_text(node.right)
        return left + right if left is not None and right is not None else None
    if isinstance(node, ast.JoinedStr):
        parts = []
        for value in node.values:
            inner = value.value if isinstance(value, ast.FormattedValue) else value
            text = _constant_text(inner)
            if text is None:
                return None
            parts.append(text)
        return "".join(parts)
    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "join"
        and len(node.args) == 1
        and isinstance(node.args[0], (ast.List, ast.Tuple))
    ):
        glue = _constant_text(node.func.value)
        parts = [_constant_text(e) for e in node.args[0].elts]
        if glue is not None and all(p is not None for p in parts):
            return glue.join(parts)
    return None


# Modules whose calls the rules below care about; names resolved into them are trusted.
RESOLVED_MODULES = {"subprocess", "os", "pty", "pickle", "marshal", "builtins"}
IMPORT_FUNCTIONS = {"importlib.import_module", "__import__", "builtins.__import__"}


class _Names:
    """Works out which module function a call really reaches, through the usual ways
    of hiding it: `import subprocess as sp`, `from os import system`,
    `m = importlib.import_module("sub" + "process")`, `__import__("os").system` and
    `getattr(m, "run")`."""

    def __init__(self, tree):
        self.aliases: dict[str, str] = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    if a.asname:
                        self.aliases[a.asname] = a.name
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                for a in node.names:
                    self.aliases[a.asname or a.name] = f"{node.module}.{a.name}"
        # Variables holding a module loaded at run time; repeat so chains resolve.
        for _ in range(2):
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Assign)
                    and len(node.targets) == 1
                    and isinstance(node.targets[0], ast.Name)
                ):
                    module = self.imported(node.value)
                    if module:
                        self.aliases[node.targets[0].id] = module

    def imported(self, node) -> str | None:
        """The module an importlib.import_module / __import__ call loads, if knowable."""
        if isinstance(node, ast.Call) and self.name(node.func) in IMPORT_FUNCTIONS and node.args:
            return _constant_text(node.args[0])
        return None

    def name(self, node) -> str:
        if isinstance(node, ast.Name):
            return self.aliases.get(node.id, node.id)
        if isinstance(node, ast.Attribute):
            base = self.name(node.value)
            return f"{base}.{node.attr}" if base else node.attr
        if isinstance(node, ast.Call):
            module = self.imported(node)
            if module:
                return module
            if self.name(node.func) in {"getattr", "builtins.getattr"} and len(node.args) >= 2:
                attr = _constant_text(node.args[1])
                base = self.name(node.args[0])
                if attr and base:
                    return f"{base}.{attr}"
            return self.name(node.func)
        return ""

    def call(self, func) -> str:
        """The name the rules match on: resolved when it lands in a module they watch,
        otherwise the call as written (so `request.args.get` stays as it reads)."""
        written = _dotted(func)
        resolved = self.name(func)
        if resolved != written and resolved.split(".")[0] in RESOLVED_MODULES:
            return resolved.removeprefix("builtins.")
        return written


def _python(path: str, source: str, findings: list, capabilities: list, imports: set):
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return
    lines = source.splitlines()
    names = _Names(tree)

    def at(node):
        return lines[node.lineno - 1] if 0 < node.lineno <= len(lines) else ""

    def cap(kind, node, detail="", uncertain=False):
        capabilities.append(
            {
                "kind": kind,
                "detail": detail,
                "file": path,
                "line": node.lineno,
                "uncertain": uncertain,
            }
        )

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imports.add(node.module.split(".")[0])
        elif isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            name = target.id if isinstance(target, ast.Name) else getattr(target, "attr", "")
            value = node.value
            if (
                SECRET_NAME.search(name or "")
                and isinstance(value, ast.Constant)
                and isinstance(value.value, str)
                and len(value.value) >= 8
                and not value.value.startswith(("http", "/", "$"))
            ):
                findings.append(
                    _finding(
                        "silo.python.hardcoded-secret",
                        "high",
                        "CWE-798",
                        "Secret written into the source",
                        path,
                        node.lineno,
                        _mask(at(node), literals=True),
                        "Anyone who can read the code (collaborators, forks, exports) gets this "
                        "credential.",
                        "Read it from an environment variable (os.environ) instead.",
                    )
                )
        elif isinstance(node, ast.Call):
            name = names.call(node.func)
            short = name.split(".")[-1]
            if name in IMPORT_FUNCTIONS or names.name(node.func) in IMPORT_FUNCTIONS:
                arg = node.args[0] if node.args else None
                module = _constant_text(arg) if arg is not None else None
                if module is None or not isinstance(arg, ast.Constant):
                    # A literal name is an ordinary import; anything else hides what loads.
                    known = f" ({module})" if module else ""
                    findings.append(
                        _finding(
                            "silo.python.dynamic-import",
                            "medium",
                            "CWE-470",
                            "Loads a module whose name is built at run time" + known,
                            path,
                            node.lineno,
                            at(node),
                            "Building a module name from pieces hides which code the app "
                            "loads, so reviewers and scanners cannot see what it can do.",
                            "Import the module normally at the top of the file.",
                        )
                    )
                    if module is None:
                        cap("process", node, "unknown module loaded at run time", uncertain=True)
            if name.startswith("subprocess.") or name in {"os.system", "os.popen", "os.spawnl"}:
                cap("process", node, name)
                if _is_true(_keyword(node, "shell")):
                    findings.append(
                        _finding(
                            "silo.python.subprocess-shell",
                            "high",
                            "CWE-78",
                            "Runs a shell command with shell=True",
                            path,
                            node.lineno,
                            at(node),
                            "With shell=True, any user-controlled text in the command can run "
                            "extra commands on the server.",
                            "Pass the command as a list and drop shell=True.",
                        )
                    )
                elif name in {"os.system", "os.popen"}:
                    # A fixed command is a smell; one built at run time can be injected into.
                    built = not (node.args and isinstance(node.args[0], ast.Constant))
                    findings.append(
                        _finding(
                            "silo.python.os-system",
                            "high" if built else "medium",
                            "CWE-78",
                            "Runs a command built at run time through the system shell"
                            if built
                            else "Runs a command through the system shell",
                            path,
                            node.lineno,
                            at(node),
                            "os.system and os.popen go through the shell, so special characters "
                            "in the command are interpreted.",
                            "Use subprocess.run([...]) with a list of arguments.",
                        )
                    )
            elif name in {"eval", "exec"}:
                findings.append(
                    _finding(
                        "silo.python.eval",
                        "high",
                        "CWE-95",
                        "Runs text as Python code",
                        path,
                        node.lineno,
                        at(node),
                        "eval/exec execute whatever text they are given, with the app's full "
                        "permissions.",
                        "Parse the input (json.loads, ast.literal_eval) instead of executing it.",
                    )
                )
            elif name in {"pickle.load", "pickle.loads", "dill.loads", "marshal.loads"}:
                findings.append(
                    _finding(
                        "silo.python.unsafe-deserialization",
                        "high",
                        "CWE-502",
                        "Loads pickled data",
                        path,
                        node.lineno,
                        at(node),
                        "Unpickling untrusted data can run arbitrary code.",
                        "Store data as JSON and load it with json.loads.",
                    )
                )
            elif name == "yaml.load" and _keyword(node, "Loader") is None:
                findings.append(
                    _finding(
                        "silo.python.yaml-load",
                        "medium",
                        "CWE-502",
                        "Unsafe YAML loading",
                        path,
                        node.lineno,
                        at(node),
                        "yaml.load without a safe loader can construct arbitrary Python objects.",
                        "Use yaml.safe_load.",
                    )
                )
            elif (
                short == "execute"
                and node.args
                and isinstance(node.args[0], (ast.JoinedStr, ast.BinOp))
                or (
                    short == "execute"
                    and node.args
                    and isinstance(node.args[0], ast.Call)
                    and _dotted(node.args[0].func).endswith(".format")
                )
            ):
                findings.append(
                    _finding(
                        "silo.python.sql-injection",
                        "high",
                        "CWE-89",
                        "Builds an SQL query from strings",
                        path,
                        node.lineno,
                        at(node),
                        "Formatting values into SQL lets crafted input change the query.",
                        "Use placeholders: cursor.execute('... WHERE id = ?', (value,)).",
                    )
                )
            elif name in {"hashlib.md5", "hashlib.sha1"}:
                findings.append(
                    _finding(
                        "silo.python.weak-hash",
                        "low",
                        "CWE-328",
                        "Weak hash function",
                        path,
                        node.lineno,
                        at(node),
                        "MD5 and SHA-1 are broken for security uses such as passwords or tokens.",
                        "Use hashlib.sha256, or a password hasher for passwords.",
                    )
                )
            elif name == "tempfile.mktemp":
                findings.append(
                    _finding(
                        "silo.python.insecure-tempfile",
                        "low",
                        "CWE-377",
                        "Predictable temporary file",
                        path,
                        node.lineno,
                        at(node),
                        "mktemp returns a name another process can create first.",
                        "Use tempfile.NamedTemporaryFile or mkstemp.",
                    )
                )
            if short == "run" and _is_true(_keyword(node, "debug")):
                findings.append(
                    _finding(
                        "silo.python.debug-mode",
                        "medium",
                        "CWE-489",
                        "Debug mode left on",
                        path,
                        node.lineno,
                        at(node),
                        "Flask's debugger lets anyone who reaches the app run code on the server.",
                        "Remove debug=True, or read it from an environment variable.",
                    )
                )
            root = name.split(".")[0]
            if root in {"requests", "httpx", "aiohttp"} or name.startswith("urllib.request."):
                url = _first_string(node)
                host = urlsplit(url).hostname if url and "://" in url else None
                if (
                    short
                    in {
                        "get",
                        "post",
                        "put",
                        "patch",
                        "delete",
                        "request",
                        "urlopen",
                        "head",
                        "stream",
                    }
                    or "Session" in name
                    or "Client" in name
                ):
                    cap("network", node, host or "dynamic destination", uncertain=host is None)
                if (
                    root == "requests"
                    and _keyword(node, "verify") is not None
                    and not getattr(_keyword(node, "verify"), "value", True)
                ):
                    findings.append(
                        _finding(
                            "silo.python.tls-verify-off",
                            "medium",
                            "CWE-295",
                            "Turns off HTTPS certificate checks",
                            path,
                            node.lineno,
                            at(node),
                            "verify=False accepts any certificate, so traffic can be intercepted.",
                            "Remove verify=False.",
                        )
                    )
                if (
                    root == "requests"
                    and short in {"get", "post", "put", "patch", "delete"}
                    and _keyword(node, "timeout") is None
                ):
                    findings.append(
                        _finding(
                            "silo.python.request-without-timeout",
                            "low",
                            "CWE-400",
                            "Network call with no timeout",
                            path,
                            node.lineno,
                            at(node),
                            "A slow or hostile server can hang the request forever and tie up "
                            "the app.",
                            "Pass timeout=10 (seconds).",
                        )
                    )
            if name in {"socket.socket", "socket.create_connection"}:
                cap("socket", node, name)
            if short == "open" and name in {"open", "io.open"}:
                mode = node.args[1] if len(node.args) > 1 else _keyword(node, "mode")
                mode_text = mode.value if isinstance(mode, ast.Constant) else "r"
                kind = "fs-write" if any(c in str(mode_text) for c in "wax+") else "fs-read"
                cap(kind, node, _first_string(node) or "dynamic path", uncertain=False)
            if short in {"write_text", "write_bytes", "mkdir", "unlink", "rmtree"}:
                cap("fs-write", node, short)
            if short in {"read_text", "read_bytes"}:
                cap("fs-read", node, short)
            if name in {"os.getenv", "os.environ.get"}:
                cap("env", node, _first_string(node) or "variable")
        elif isinstance(node, ast.Subscript) and _dotted(node.value) == "os.environ":
            cap("env", node, "os.environ")

    db_imports = {
        "sqlite3": "SQLite",
        "sqlalchemy": "SQLAlchemy",
        "psycopg": "PostgreSQL",
        "psycopg2": "PostgreSQL",
        "pymongo": "MongoDB",
        "redis": "Redis",
        "mysql": "MySQL",
        "pymysql": "MySQL",
    }
    serve_imports = {
        "flask": "Flask",
        "fastapi": "FastAPI",
        "streamlit": "Streamlit",
        "django": "Django",
        "starlette": "Starlette",
        "gradio": "Gradio",
    }
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = (
                [a.name for a in node.names]
                if isinstance(node, ast.Import)
                else [node.module or ""]
            )
            for full in names:
                top = full.split(".")[0]
                if top in db_imports:
                    cap("database", node, db_imports[top])
                if top in serve_imports:
                    cap("serve", node, serve_imports[top])


def _web(path: str, source: str, findings: list, capabilities: list, remote: list):
    lines = source.splitlines()
    is_html = path.lower().endswith((".html", ".htm"))

    def around(line, match):  # long minified or single-line HTML: show the matched part
        start = max(0, match.start() - 40)
        return ("…" if start else "") + line[start : match.end() + 80]

    for number, line in enumerate(lines, 1):
        for rule_id, pattern, severity, cwe, title, why, fix in JS_RULES:
            match = pattern.search(line)
            if match:
                findings.append(
                    _finding(
                        rule_id,
                        severity,
                        cwe,
                        title,
                        path,
                        number,
                        _mask(around(line, match)),
                        why,
                        fix,
                    )
                )
        for match in re.finditer(
            r"\b(fetch|axios\.\w+|new\s+WebSocket|XMLHttpRequest)\s*\(?\s*(['\"`]?)([^'\"`\s)]*)",
            line,
        ):
            quoted, target = match.group(2), match.group(3)
            if quoted and "://" not in target and not target.startswith("${"):
                continue  # A literal relative URL goes to the app's own server, not outside.
            host = urlsplit(target).hostname if "://" in target else None
            capabilities.append(
                {
                    "kind": "network",
                    "detail": host or "dynamic destination",
                    "file": path,
                    "line": number,
                    "uncertain": host is None,
                }
            )
        if re.search(r"\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b", line):
            capabilities.append(
                {
                    "kind": "storage",
                    "detail": re.search(
                        r"\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b", line
                    ).group(1),
                    "file": path,
                    "line": number,
                    "uncertain": False,
                }
            )
        if re.search(r"navigator\.(mediaDevices|geolocation)|getUserMedia", line):
            capabilities.append(
                {
                    "kind": "device",
                    "detail": "camera, microphone or location",
                    "file": path,
                    "line": number,
                    "uncertain": False,
                }
            )
        if is_html:
            for match in HTML_SCRIPT.finditer(line):
                url = match.group(2)
                host = urlsplit(url).hostname or url
                remote.append(
                    {
                        "name": host,
                        "version": url.rsplit("/", 1)[-1][:60],
                        "ecosystem": "web",
                        "source": "script tag",
                    }
                )
                capabilities.append(
                    {
                        "kind": "remote-script",
                        "detail": host,
                        "file": path,
                        "line": number,
                        "uncertain": False,
                    }
                )
                if "integrity=" not in (match.group(1) + match.group(3)).lower():
                    findings.append(
                        _finding(
                            "silo.html.script-without-integrity",
                            "medium",
                            "CWE-829",
                            "Loads a remote script without an integrity check",
                            path,
                            number,
                            around(line, match),
                            f"If {host} is compromised or changes the file, the new code runs in "
                            "your app with full access to the page.",
                            'Add integrity="sha384-…" crossorigin="anonymous", or host the file '
                            "with your app.",
                        )
                    )


def _secrets(path: str, source: str, findings: list):
    for number, line in enumerate(source.splitlines(), 1):
        for pattern, label in SECRET_PATTERNS:
            if pattern.search(line):
                findings.append(
                    _finding(
                        "silo.secret." + label.lower().replace(" ", "-"),
                        "high",
                        "CWE-798",
                        f"{label.capitalize()} in the source",
                        path,
                        number,
                        _mask(line),
                        "Anyone with access to the code, its exports or its history can use "
                        "this credential.",
                        "Revoke it, then load it from an environment variable.",
                    )
                )


# ---------------------------------------------------------------------------
# Semgrep (optional engine)
# ---------------------------------------------------------------------------


def semgrep_binary() -> str | None:
    found = shutil.which("semgrep")
    if found:
        return found
    # `uv tool install semgrep` puts it here, which a server's PATH may not include.
    candidate = (
        Path.home() / ".local" / "bin" / ("semgrep.exe" if sys.platform == "win32" else "semgrep")
    )
    return str(candidate) if candidate.exists() else None


def semgrep_version() -> str | None:
    binary = semgrep_binary()
    if not binary or not RULES_FILE.exists():
        return None
    try:
        out = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.stdout.strip().splitlines()[-1] if out.returncode == 0 and out.stdout else None


def _cache_dir() -> Path:
    from ..config import settings

    directory = Path(settings.bundle_storage_path).resolve().parent / "security-cache"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _rules_digest() -> str:
    return (
        hashlib.sha256(RULES_FILE.read_bytes()).hexdigest()[:10] if RULES_FILE.exists() else "none"
    )


def semgrep_findings(file_sets: list[dict[str, str]]) -> list[list[dict] | None]:
    """Semgrep findings for each build, or None for all when Semgrep is unavailable.

    Builds are cached on disk by source digest and rule-file digest. Every build
    not yet cached is scanned in a single Semgrep run, because starting Semgrep
    costs far more than scanning a small app.
    """
    binary = semgrep_binary()
    if not binary or not RULES_FILE.exists():
        return [None] * len(file_sets)
    rules = _rules_digest()
    cache = _cache_dir()
    results: list[list[dict] | None] = [None] * len(file_sets)
    missing: dict[str, tuple[dict[str, str], list[int]]] = {}
    for index, files in enumerate(file_sets):
        digest = digest_files(files)[:24]
        cached = cache / f"{digest}-{rules}.json"
        if cached.exists():
            results[index] = json.loads(cached.read_text(encoding="utf-8"))
        elif files:
            missing.setdefault(digest, (files, []))[1].append(index)
        else:
            results[index] = []
    if not missing:
        return results
    with tempfile.TemporaryDirectory(prefix="silo-semgrep-") as directory:
        root = Path(directory)
        for digest, (files, _) in missing.items():
            for rel, content in files.items():
                target = root / digest / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
        try:
            out = subprocess.run(
                [
                    binary,
                    "scan",
                    "--config",
                    str(RULES_FILE),
                    "--json",
                    "--metrics=off",
                    "--quiet",
                    "--disable-version-check",
                    str(root),
                ],
                capture_output=True,
                text=True,
                timeout=300,
                encoding="utf-8",
            )
            data = json.loads(out.stdout or "{}")
        except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
            return results
    by_build: dict[str, list[dict]] = {digest: [] for digest in missing}
    for result in data.get("results", []):
        path = PurePosixPath(
            Path(result.get("path", "")).resolve().relative_to(root.resolve()).as_posix()
        )
        digest, rel = path.parts[0], "/".join(path.parts[1:])
        if digest in by_build:
            by_build[digest].append(parse_semgrep_result(result, rel, missing[digest][0]))
    for digest, findings in by_build.items():
        (cache / f"{digest}-{rules}.json").write_text(json.dumps(findings), encoding="utf-8")
        for index in missing[digest][1]:
            results[index] = findings
    return results


def parse_semgrep_result(result: dict, rel: str, files: dict[str, str]) -> dict:
    """One Semgrep JSON result as a Silo finding, with the code line taken from the source."""
    severity = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}
    extra = result.get("extra", {})
    meta = extra.get("metadata", {})
    line = result.get("start", {}).get("line", 1)
    source_lines = files.get(rel, "").splitlines()
    snippet = source_lines[line - 1] if 0 < line <= len(source_lines) else ""
    cwe = meta.get("cwe") or ["CWE-?"]
    cwe = (cwe[0] if isinstance(cwe, list) else str(cwe)).split(":")[0]
    return _finding(
        "semgrep." + result.get("check_id", "rule").split(".")[-1],
        severity.get(extra.get("severity", "WARNING"), "medium"),
        cwe,
        meta.get("title") or extra.get("message", "Semgrep finding").split(".")[0],
        rel,
        line,
        _mask(snippet),
        extra.get("message", ""),
        meta.get("fix", "See the rule's guidance."),
        engine="semgrep",
    )


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

REQUIREMENT = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9_.\-\[\]]*)\s*([<>=!~][^#;]*)?")


def _dependencies(files: dict[str, str], imports: set[str], remote: list) -> list[dict]:
    deps: dict[str, dict] = {}

    def add(name, version, ecosystem, source):
        key = f"{ecosystem}:{re.sub(r'[-_.]+', '-', name.split('[')[0]).lower()}"
        if key not in deps or deps[key]["source"] == "import":
            deps[key] = {
                "name": name,
                "version": (version or "").strip() or "any",
                "ecosystem": ecosystem,
                "source": source,
            }

    local = {PurePosixPath(p).parts[0].removesuffix(".py") for p in files}
    for path, content in files.items():
        name = PurePosixPath(path).name
        if re.fullmatch(r"requirements.*\.txt", name) and "dev" not in name and "test" not in name:
            for line in content.splitlines():
                if line.strip().startswith(("#", "-")):
                    continue
                match = REQUIREMENT.match(line)
                if match:
                    add(match.group(1), match.group(2), "python", path)
        elif name == "pyproject.toml":
            try:
                project = tomllib.loads(content).get("project", {})
            except tomllib.TOMLDecodeError:
                project = {}
            for spec in project.get("dependencies", []):
                match = REQUIREMENT.match(spec)
                if match:
                    add(match.group(1), match.group(2), "python", path)
        elif name == "package.json":
            try:
                package = json.loads(content)
            except json.JSONDecodeError:
                package = {}
            for section in ("dependencies", "devDependencies"):
                for dep, version in (package.get(section) or {}).items():
                    add(
                        dep,
                        str(version),
                        "npm",
                        path + (" (dev)" if section != "dependencies" else ""),
                    )
    for module in sorted(imports):
        if module in STDLIB or module in local:
            continue
        package = IMPORT_TO_PACKAGE.get(module, module)
        if package:
            add(package, "", "python", "import")
    for item in remote:
        deps.setdefault(f"web:{item['name']}:{item['version']}", item)
    return sorted(deps.values(), key=lambda d: (d["ecosystem"], d["name"].lower()))


# ---------------------------------------------------------------------------
# Analysis and comparison
# ---------------------------------------------------------------------------

_CACHE: OrderedDict[tuple[str, bool], dict] = OrderedDict()


def analyze(files: dict[str, str], semgrep: list[dict] | None = None) -> dict:
    """The build's label, dependencies and findings.

    `semgrep` is that build's Semgrep findings (from semgrep_findings), or None
    when Semgrep is not installed; Silo's built-in rules always run.
    """
    key = (digest_files(files), semgrep is not None)
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    findings: list[dict] = []
    raw_caps: list[dict] = []
    imports: set[str] = set()
    remote: list[dict] = []
    for path, content in files.items():
        lower = path.lower()
        if lower.endswith(".py"):
            _python(path, content, findings, raw_caps, imports)
        elif lower.endswith((".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".html", ".htm")):
            _web(path, content, findings, raw_caps, remote)
        _secrets(path, content, findings)
    engines = ["silo"]
    if semgrep is not None:
        engines.append("semgrep")
        # Where both engines flag the same line for the same weakness, keep Semgrep's.
        seen = {(f["file"], f["line"], f["cwe"]) for f in semgrep}
        findings = [dict(f) for f in semgrep] + [
            f for f in findings if (f["file"], f["line"], f["cwe"]) not in seen
        ]

    unique = {}
    for f in findings:
        unique.setdefault((f["rule_id"], f["file"], f["line"]), f)
    findings = sorted(
        unique.values(), key=lambda f: (SEVERITY_ORDER.index(f["severity"]), f["file"], f["line"])
    )
    for f in findings:
        f["fingerprint"] = hashlib.sha1(
            f"{f['rule_id']}|{f['file']}|{re.sub(r'\s+', ' ', f['snippet'])}".encode()
        ).hexdigest()[:12]

    capabilities: dict[str, dict] = {}
    for c in raw_caps:
        key = (
            f"{c['kind']}:{c['detail']}"
            if c["kind"] in {"network", "remote-script", "database", "serve"}
            else c["kind"]
        )
        entry = capabilities.setdefault(
            key,
            {
                "key": key,
                "kind": c["kind"],
                "label": CAPABILITY_LABELS[c["kind"]],
                "detail": c["detail"]
                if c["kind"] in {"network", "remote-script", "database", "serve"}
                else "",
                "tone": CAPABILITY_TONE[c["kind"]],
                "uncertain": c["uncertain"],
                "evidence": [],
            },
        )
        entry["uncertain"] = entry["uncertain"] and c["uncertain"]
        if len(entry["evidence"]) < 5:
            entry["evidence"].append({"file": c["file"], "line": c["line"]})
    caps = sorted(
        capabilities.values(), key=lambda c: (list(CAPABILITY_LABELS).index(c["kind"]), c["detail"])
    )
    deps = _dependencies(files, imports, remote)
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in SEVERITY_ORDER}
    risk = min(
        100,
        sum(SEVERITY_WEIGHT[f["severity"]] for f in findings)
        + sum({"low": 0, "medium": 2, "high": 5}[c["tone"]] for c in caps),
    )
    manifest = sorted(c["key"] for c in caps) + sorted(
        f"{d['ecosystem']}:{d['name']}" for d in deps
    )
    result = {
        "files": len(files),
        "lines": sum(content.count("\n") + 1 for content in files.values()),
        "languages": sorted({PurePosixPath(p).suffix.lstrip(".") or "other" for p in files}),
        "capabilities": caps,
        "dependencies": deps,
        "findings": findings,
        "counts": counts,
        "risk": risk,
        "manifest_digest": hashlib.sha256("\n".join(manifest).encode()).hexdigest()[:16],
        "engines": engines,
    }
    _CACHE[key] = result
    if len(_CACHE) > 256:
        _CACHE.popitem(last=False)
    return result


def _file_changes(before: dict[str, str], after: dict[str, str]) -> list[dict]:
    changes = []
    for path in sorted(before.keys() | after.keys()):
        old, new = before.get(path), after.get(path)
        if old == new:
            continue
        diff = list(
            difflib.unified_diff(
                (old or "").splitlines(),
                (new or "").splitlines(),
                fromfile="a/" + path,
                tofile="b/" + path,
                lineterm="",
                n=2,
            )
        )
        added = sum(1 for d in diff if d.startswith("+") and not d.startswith("+++"))
        removed = sum(1 for d in diff if d.startswith("-") and not d.startswith("---"))
        changes.append(
            {
                "path": path,
                "status": "added" if old is None else "removed" if new is None else "modified",
                "added": added,
                "removed": removed,
                "diff": "\n".join(diff[:400]) + ("\n… diff truncated" if len(diff) > 400 else ""),
            }
        )
    return changes


def compare(
    before_files: dict[str, str], after_files: dict[str, str], before: dict, after: dict
) -> dict:
    """What changed between two builds and what it means for security."""
    before_caps = {c["key"]: c for c in before["capabilities"]}
    after_caps = {c["key"]: c for c in after["capabilities"]}
    before_deps = {f"{d['ecosystem']}:{d['name'].lower()}": d for d in before["dependencies"]}
    after_deps = {f"{d['ecosystem']}:{d['name'].lower()}": d for d in after["dependencies"]}
    before_f = {f["fingerprint"]: f for f in before["findings"]}
    after_f = {f["fingerprint"]: f for f in after["findings"]}

    caps_added = [after_caps[k] for k in after_caps.keys() - before_caps.keys()]
    caps_removed = [before_caps[k] for k in before_caps.keys() - after_caps.keys()]
    new_findings = [f for k, f in after_f.items() if k not in before_f]
    fixed = [f for k, f in before_f.items() if k not in after_f]
    deps_added = [after_deps[k] for k in after_deps.keys() - before_deps.keys()]
    deps_removed = [before_deps[k] for k in before_deps.keys() - after_deps.keys()]
    deps_changed = [
        {
            "name": after_deps[k]["name"],
            "ecosystem": after_deps[k]["ecosystem"],
            "from": before_deps[k]["version"],
            "to": after_deps[k]["version"],
        }
        for k in after_deps.keys() & before_deps.keys()
        if before_deps[k]["version"] != after_deps[k]["version"]
    ]
    serious_new = [f for f in new_findings if f["severity"] in {"high", "medium"}]
    widening = caps_added or serious_new or deps_added
    narrowing = caps_removed or fixed or deps_removed
    classification = "expanding" if widening else "reducing" if narrowing else "neutral"
    return {
        "classification": classification,
        "verdict": _verdict(
            classification, caps_added, caps_removed, new_findings, fixed, deps_added, deps_removed
        ),
        "risk_before": before["risk"],
        "risk_after": after["risk"],
        "files": _file_changes(before_files, after_files),
        "capabilities_added": sorted(caps_added, key=lambda c: c["key"]),
        "capabilities_removed": sorted(caps_removed, key=lambda c: c["key"]),
        "dependencies_added": sorted(deps_added, key=lambda d: d["name"]),
        "dependencies_removed": sorted(deps_removed, key=lambda d: d["name"]),
        "dependencies_changed": sorted(deps_changed, key=lambda d: d["name"]),
        "findings_new": sorted(new_findings, key=lambda f: SEVERITY_ORDER.index(f["severity"])),
        "findings_fixed": sorted(fixed, key=lambda f: SEVERITY_ORDER.index(f["severity"])),
    }


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _verdict(kind, caps_added, caps_removed, new, fixed, deps_added, deps_removed) -> str:
    """A plain-English summary built only from the rule results above."""
    parts = []
    if caps_added:
        parts.append(
            "can now "
            + ", ".join(
                CAPABILITY_VERBS[c["kind"]] + (f" ({c['detail']})" if c["detail"] else "")
                for c in caps_added[:3]
            )
        )
    if new:
        worst = new[0]
        parts.append(
            f"introduces {_plural(len(new), 'finding')}, worst: {worst['title'].lower()}"
            f" ({worst['severity']})"
        )
    if deps_added:
        parts.append("adds " + ", ".join(d["name"] for d in deps_added[:4]))
    if caps_removed:
        parts.append(
            "can no longer " + ", ".join(CAPABILITY_VERBS[c["kind"]] for c in caps_removed[:3])
        )
    if fixed:
        parts.append(f"fixes {_plural(len(fixed), 'finding')}")
    if deps_removed:
        parts.append("drops " + ", ".join(d["name"] for d in deps_removed[:4]))
    if not parts:
        return "Code changed, but what the app can do and its findings are the same."
    sentence = "This build " + "; ".join(parts) + "."
    if kind == "expanding":
        sentence += " Review before publishing."
    return sentence
