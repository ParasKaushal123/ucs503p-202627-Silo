**UCS503: Software Engineering (Project)**  
**TIET Patiala**

# Silo

A zero-configuration platform for publishing and collaboratively
improving AI-generated applications.

**Team (Group 3C75)**: Paras Kaushal (1024030984), Dev Kapla
(1024030888), Devanshu (1024030876). **Advisor**: Dr. Nisha Thakur.

Upload a small app as a ZIP. Silo builds and runs it in Docker, lets the
team edit its code together live in the browser, and checks every
version for security risks before anyone trusts it.

## Run

``` shell
cd code
python scripts/start.py --local
```

Then open <http://localhost:3000/auth/local>. On Windows, double-click
`code/start-silo.bat`. Requirements and options are in `code/README.md`.

## Repository

| Folder | Contents |
|---|---|
| `code/` | The finished project: web app, API, collaboration server, local AI, tests |
| `journals/` | Weekly journals, one folder per member |
| `project-proposal/` | Project proposal |
| `project-report-prototype-stage/` | Mid-semester report |
| `project-report-final/` | Final report (`main.tex`, `main.pdf`) |
