"""Fill the course test-case template (Dr Ghazy Assassa) for Silo's four test cases.

    python testing/make_report.py          -> testing/Silo_Test_Cases.html
    node apps/web/.render-pdf.mjs          -> testing/Silo_Test_Cases.pdf  (run from apps/web)

Written for an evaluator, in the template's plain style: one page per test case,
results from the final run in testing/results/after-fix/.
"""

import html
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SILO = {
    "system": "Silo", "title": "Silo Test Cases", "file": "Silo_Test_Cases",
    "design_date": "08/11/2026", "executed_by": "Paras Kaushal, Dev Kapla, Devanshu", "execution_date": "17/11/2026",
}
NURSESYNC = {
    "system": "NurseSync", "title": "NurseSync Test Cases", "file": "NurseSync_Test_Cases",
    "design_date": "08/11/2026", "executed_by": "", "execution_date": "17/11/2026",
}

# (action, expected system response, pass/fail, comment)
CASES = [
    {
        "id": "TC-01",
        "designed_by": "Deepank Agarwal",
        "name": "Simultaneous editing",
        "subsystem": "Workbench (shared editor)",
        "short": "Test that two users editing the same line at the same time both keep their changes",
        "pre": [
            "Two users, Alex (owner) and Morgan (editor), are logged in on separate computers",
            "Both users have the app \"Counter\" open in the Workbench",
            "The file index.html is open on both screens",
        ],
        "steps": [
            ("Both users click at the end of the last line of index.html",
             "The cursor is placed at the end of the line on both screens", "Pass", ""),
            ("At the same moment, Alex types 'Alex edited' and Morgan types 'Morgan edited'",
             "Both lines appear on both screens\nThe status shows 'Saving…' and then 'Saved'", "Pass", "No error shown"),
            ("Both users compare their screens",
             "Both screens show the same text, with each line appearing once", "Pass", ""),
            ("Morgan refreshes the page and opens index.html again",
             "Both lines are still there", "Pass", ""),
        ],
        "post": ["The saved file contains both lines, each exactly once"],
    },
    {
        "id": "TC-02",
        "designed_by": "Deepank Agarwal",
        "name": "Remove an editor during editing",
        "subsystem": "Sharing and access",
        "short": "Test that a removed editor loses access immediately, even with the editor still open",
        "pre": [
            "Alex (owner) and Morgan (editor) are logged in on separate computers",
            "Morgan joined the app through an invitation link and has the Workbench open",
            "A third user, Sam, has an account but no access to the app",
        ],
        "steps": [
            ("Alex clicks 'Share' and removes Morgan",
             "Within 5 seconds, Morgan's screen shows 'Access changed – reload'", "Pass", "Shown after about 1 second"),
            ("Morgan tries to type in the open file",
             "The editor does not accept typing and nothing Morgan types is saved", "Pass", ""),
            ("Morgan refreshes the page",
             "The system shows 'App not found' and Morgan can no longer see the code", "Pass", ""),
            ("Alex clicks 'Revoke invitation links'",
             "The system displays the message 'Invitation links revoked'", "Pass", ""),
            ("Sam opens the old invitation link",
             "The system displays 'Invitation not found'", "Pass", ""),
        ],
        "post": ["Morgan is removed from the app's member list; only Alex remains"],
    },
    {
        "id": "TC-03",
        "designed_by": "Pushti",
        "name": "Security check of an update and its fix",
        "subsystem": "Security Track",
        "short": "Test that the Security Track finds the problems a new version adds and recognises when they are fixed",
        "pre": [
            "Alex is logged in and has an empty app called \"Expense notes\"",
            "Three versions of the app are ready to upload: v1 (safe), v2 (contains 10 known security problems) "
            "and v3 (v2 with all 10 problems fixed)",
        ],
        "steps": [
            ("Upload v1, then v2, then v3",
             "The system shows three versions of the app", "Pass", ""),
            ("Open the Security Track",
             "The system shows the three versions in order\nv1 → v2 is marked 'Expanding' and v2 → v3 is marked 'Reducing'",
             "Pass", ""),
            ("Click v1",
             "The label shows the app serves a web page and uses a database\nNo problems are reported", "Pass", ""),
            ("Click v2",
             "The system reports 10 problems (4 high, 5 medium, 1 low) and a high risk score", "Pass", "Risk score 76 of 100"),
            ("Open the list of problems for v2",
             "Each problem shows where it is and how to fix it\nThe secret key in the code is not displayed", "Pass", ""),
            ("Click v3",
             "No problems are reported and the 10 problems are listed as fixed\nThe risk score drops", "Pass",
             "Risk score 13 of 100"),
        ],
        "post": ["The risk chart shows one bar for each of the three versions"],
    },
    {
        "id": "TC-04",
        "designed_by": "Simar Verma",
        "name": "Detect hidden system commands",
        "subsystem": "Security Track",
        "short": "Test that the Security Track detects an app that runs system commands even when the code hides it",
        "pre": [
            "Alex is logged in and has an empty app",
            "Two versions are ready to upload: v1 (safe) and v2 (adds a hidden admin page that runs any "
            "command sent to it, with the commands disguised in the code)",
        ],
        "steps": [
            ("Upload v1, then v2",
             "The system shows two versions of the app", "Pass", ""),
            ("Open the Security Track and click v2",
             "v1 → v2 is marked 'Expanding'", "Pass", ""),
            ("Open the label for v2",
             "The label lists 'Runs system commands'", "Pass", ""),
            ("Open the list of problems for v2",
             "A high-severity problem is reported for each hidden command", "Pass", "All 3 commands found"),
            ("Look for a warning about the disguised code",
             "The system warns that the code hides which part of the program it loads", "Pass", ""),
        ],
        "post": ["v2's risk score is higher than v1's"],
    },
]


def esc(text: str) -> str:
    return html.escape(text).replace("\n", "<br>")


def page(case: dict, number: int, total: int, project: dict) -> str:
    executed_by = case.get("executed_by", project["executed_by"])
    steps = case["steps"] + [
        (f"<b>Check post-condition {i}</b>", "", case.get("post_result", "Pass"), "") for i in range(1, len(case["post"]) + 1)
    ]
    rows = "".join(
        f"<tr><td class='c'>{n}</td><td>{a if a.startswith('<b>') else esc(a)}</td><td>{esc(e)}</td>"
        f"<td class='c'>{esc(p)}</td><td>{esc(c)}</td></tr>"
        for n, (a, e, p, c) in enumerate(steps, 1)
    )
    pre = "".join(f"<div>{esc(p)}</div>" for p in case["pre"])
    post = "".join(f"<li>{esc(p)}</li>" for p in case["post"])
    return f"""
<section class="sheet">
  <div class="running"><span>Software Engineering – {project["title"]}</span><span>Page {number} of {total}</span></div>
  <h1>Test Case {number} <span>({esc(case['name'])})</span></h1>
  <div class="box head">
    <div><b>Test Case #:</b> <span class="v">{case['id']}</span></div>
    <div><b>Test Case Name:</b> <span class="v">{esc(case['name'])}</span></div>
    <div><b>Page:</b> <span class="v">1 of 1</span></div>
    <div><b>System:</b> <span class="v">{project["system"]}</span></div>
    <div class="span2"><b>Subsystem:</b> <span class="v">{esc(case['subsystem'])}</span></div>
    <div><b>Designed by:</b> <span class="v">{esc(case["designed_by"])}</span></div>
    <div class="span2"><b>Design Date:</b> <span class="v">{project["design_date"]}</span></div>
    <div><b>Executed by:</b> <span class="v">{esc(executed_by)}</span></div>
    <div class="span2"><b>Execution Date:</b> <span class="v">{project["execution_date"]}</span></div>
    <div class="span3"><b>Short Description:</b> <span class="v">{esc(case['short'])}</span></div>
  </div>
  <div class="box pre"><b>Pre-conditions</b>{pre}</div>
  <table>
    <colgroup><col style="width:5%"><col style="width:28%"><col style="width:41%"><col style="width:7%"><col style="width:19%"></colgroup>
    <thead><tr><th>Step</th><th>Action</th><th>Expected System Response</th><th>Pass/<br>Fail</th><th>Comment</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <div class="box post"><b>Post-conditions</b><ol>{post}</ol></div>
</section>"""


CSS = """
@page { size: A4 landscape; margin: 14mm 18mm; }
* { box-sizing: border-box; }
body { font: 11pt/1.25 "Times New Roman", Times, serif; color: #000; background: #fff; margin: 0; }
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
.running { display: flex; justify-content: space-between; font-size: 11pt; margin-bottom: 6px; }
h1 { text-align: center; font-size: 19pt; margin: 2px 0 10px; }
h1 span { font-weight: normal; }
.box { border: 1px solid #000; padding: 5px 10px; margin-bottom: 9px; }
.head { display: grid; grid-template-columns: 44% 40% 16%; row-gap: 5px; padding: 8px 10px 9px; }
.head .span2 { grid-column: span 2; }
.head .span3 { grid-column: span 3; }
.v { color: #1f3fe0; }
.pre div { margin-left: 4px; }
table { border-collapse: collapse; width: 100%; margin-bottom: 9px; }
th { background: #e0e0e0; text-align: left; vertical-align: top; }
th, td { border: 1px solid #000; padding: 2px 5px; vertical-align: top; }
tr { page-break-inside: avoid; }
.c { text-align: center; }
.post ol { margin: 2px 0 6px; padding-left: 26px; }
"""


def build(project: dict, cases: list) -> None:
    body = "".join(page(c, i, len(cases), project) for i, c in enumerate(cases, 1))
    out = ROOT / f"{project['file']}.html"
    out.write_text(
        f"<!doctype html><html lang='en'><head><meta charset='utf-8'><title>{project['title']}</title>"
        f"<style>{CSS}</style></head><body>{body}</body></html>",
        encoding="utf8",
    )
    print("wrote", out)


def main() -> None:
    from nursesync_cases import NURSESYNC_CASES

    build(SILO, CASES)
    build(NURSESYNC, NURSESYNC_CASES)


if __name__ == "__main__":
    main()
