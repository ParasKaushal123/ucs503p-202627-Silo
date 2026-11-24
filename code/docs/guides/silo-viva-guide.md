# Silo — Viva Preparation Guide
### Software Engineering (UCS503P) · Requirements Engineering, Analysis Modelling, UML and Project Diagrams

**Project:** Silo — "Google Docs for small software": a zero-configuration deployment platform for AI-generated Python applications
**Team:** Paras Kaushal (1024030984), Dev Kapla (1024030888), Devanshu (1024030876) · Group 3C75
**Instructor:** Dr. Nisha Thakur

---

### How to use this guide

The viva will be asked in the language of the slides. So each section below does three things, in this order:

1. **The theory** — explained properly, in plain language, the way the slide means it.
2. **How Silo used it** — the actual decision we made, the artefact we produced, and where it lives.
3. **Likely viva questions** — with the answer you should give.

If you are short on time, read the theory paragraph and the "How Silo used it" paragraph of every section. That combination is what the examiner is testing: *do you know the concept, and can you point at your own project as proof?*

---
---

# PART 1 — REQUIREMENTS ENGINEERING (Slide Set 4)

## 1.1 What requirements engineering actually is

Requirements engineering is the process of working out **what services the customer wants from a system, and the constraints under which that system must operate and be built**. Notice that the definition has two halves. The first half is about services — the things the system does for somebody. The second half is about constraints — the limits inside which those services must be delivered, such as how fast, how reliably, on what hardware, under what law. A system that does all the right things but takes four minutes to respond has satisfied the first half and failed the second, and it is still a failed system.

The word **requirement** itself is deliberately loose. The slides say a requirement may range from a high-level abstract statement of a service all the way down to a detailed mathematical functional specification. This range is not sloppiness — it is a real property of software projects. Very early, when you are talking to a customer who does not know what is technically possible, the only honest thing you can write is something abstract like "the system shall let a user deploy an application without configuring anything." Much later, when a developer has to implement it, that same requirement has been sharpened into something like "on receiving a POST to /apps/{id}/versions with a multipart body, the system shall create a version record with status = analysing and return 201 within 2 seconds." Both are requirements. They are the same requirement at different levels of abstraction.

**Requirements** (the noun, plural) are then defined as the descriptions of the system services and constraints that are *generated during* the requirements engineering process. So requirements are the **output**; requirements engineering is the **process**.

## 1.2 The three levels of requirement, and who reads each

The slides separate requirements into three levels, and this separation exists entirely because **different people need different amounts of detail**. Writing one document for everybody fails, because it will be either too vague for the developer or too technical for the customer.

**User requirements** are statements in natural language, plus diagrams, describing the services the system provides and its operational constraints. They are **written for customers**. The key property is that a user requirement must be understandable by somebody who has no technical knowledge of the system. It talks about what the user gets, not about how the machine achieves it.

**System requirements** are a structured document setting out detailed descriptions of the system's services. The slides make a very important point about their purpose: system requirements are **written as a contract between client and contractor**. This is why they are structured and precise — if there is a dispute later about whether the delivered system is what was ordered, this is the document that settles it. Legal weight is the reason for the formality.

**Software specification** is a detailed software description that can serve as the basis for design or implementation. It is **written for developers**.

The slides also list the **readers** of each level, and examiners love asking this because it shows whether you understood *why* the levels exist:

| Level | Who reads it |
|---|---|
| User requirements | Client managers, system end-users, client engineers, contractor managers, system architects |
| System requirements | System end-users, client engineers, system architects, software developers |
| Software design specification | Client engineers (perhaps), system architects, software developers |

Read the table downwards and you see the pattern: as you go deeper, **managers and customers drop out and engineers come in**. Client managers appear only at the top level; developers appear only at the bottom two. The one group that appears at both the top and the middle is end-users, because they must be able to check that the detailed system requirements still describe the system they asked for.

### How Silo used it

We wrote our requirements at all three levels, and we can show the examiner the difference:

- **User requirement (for our customer, the non-expert developer):** "A user shall be able to upload a Python application and receive a working web address for it, without writing a Dockerfile, a requirements file, or any configuration."
- **System requirement (contract level):** "On upload the system shall accept either a single `.py` file or a `.zip` archive, extract the archive rejecting any entry whose resolved path lies outside the extraction directory, create a version record with status `analysing`, and return HTTP 201 without waiting for the build to finish."
- **Software specification (for us as developers):** "`versions.py` shall spawn a detached subprocess `python -m silo_api.build_worker <version_id> <app_slug> <bundle_path>` with `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP` on Windows, so that the build survives an API reload."

All three are the same requirement. Being able to state one requirement at three levels on demand is the single most convincing thing you can do in this part of the viva.

## 1.3 Functional requirements

Functional requirements are **statements of the services the system should provide, how the system should react to particular inputs, and how the system should behave in particular situations.** All three clauses matter. "Provide a service" covers normal operation; "react to particular inputs" covers what happens when specific data arrives; "behave in particular situations" covers the awkward cases — what happens when the disk is full, when the input is malformed, when two users act at once.

Functional requirements **depend on the type of software, the expected users, and the type of system** the software runs in. The same words mean different things in different domains — "the system shall notify the user" means an email in one system and a hardware alarm in another.

The slides give classic examples, and it is worth noticing their shape: *"The user shall be able to search either all of the initial set of databases or select a subset from it."* — a service. *"Every order shall be allocated a unique identifier (ORDER_ID) which the user shall be able to copy to the account's permanent storage area."* — a service with a data constraint built in.

### How Silo used it

Our main functional requirements, stated in slide style:

- The system **shall** authenticate every user through Google OAuth 2.0 before any application may be created.
- The user **shall** be able to create an application and upload a new version as a `.py` file or a `.zip` archive.
- The system **shall** determine the entry point, the runtime dependencies, the start command and the listening port of an uploaded application without any configuration file supplied by the user.
- The system **shall** build a container image for each version and run that image in an isolated container.
- The system **shall** record a version as *live* only after a network connection to its published port has succeeded.
- The user **shall** be able to read the build log of any version of an application they own.
- The system **shall** serve a live application to its owner through a reverse proxy path of the form `/proxy/{version_id}`.

Every one of these is testable, which is the point of writing them this way.

## 1.4 Non-functional requirements

Non-functional requirements are **constraints on the services or functions offered by the system** — timing constraints, constraints on the development process, standards, and so on. The slides define them again slightly differently a few pages later as requirements that **define system properties and constraints**, e.g. reliability, response time and storage. Both definitions describe the same idea: a functional requirement says *what the system does*, a non-functional requirement says *how well, how fast, how safely, or under what rules it does it*.

The slides make a claim that examiners very often ask about: **non-functional requirements may be more critical than functional requirements — if these are not met, the system is useless.** The reasoning is that a failure of one function usually degrades the system, while a failure of a non-functional property usually destroys it. If one report in an accounting package prints wrong, you lose one report. If the whole package takes six minutes to open, nobody uses the package at all. That is the argument to give.

The slides also note that **process requirements** may be specified, mandating a particular CASE tool, programming language or development method. So a non-functional requirement can constrain how you *build* the system, not only how the system *behaves*.

### The three classifications

This classification is asked constantly, so learn it by the *source* of the requirement, not by memorising lists.

**Product requirements** specify that the delivered product must behave in a particular way — execution speed, reliability, and so on. These come **from the product itself**.

**Organisational requirements** are a consequence of organisational policies and procedures — process standards used, implementation requirements, and so on. These come **from the company building or buying the system**.

**External requirements** arise from factors external to the system and its development process — interoperability requirements, legislative requirements, and so on. These come **from the outside world**.

The full type tree from the slides:

- **Product requirements** → usability, efficiency (which splits into **performance** and **space**), reliability, portability
- **Organisational requirements** → delivery, implementation, standards
- **External requirements** → interoperability, ethical, legislative (which splits into **privacy** and **safety**)

Note the two-level structure: efficiency contains performance and space; legislative contains privacy and safety. Drawing that tree correctly on the board is an easy mark.

### How Silo used it

| Classification | Silo's non-functional requirement |
|---|---|
| Product — performance | The inference stage (entry point, dependency, port detection) shall complete in under 500 ms per application. *Measured: under 2 ms.* |
| Product — reliability | A version shall never be reported as *live* unless a TCP connection to its published port has actually succeeded. |
| Product — usability | A first-time user shall complete an upload-to-live-URL cycle without reading documentation and without writing any configuration file. |
| Product — space | Each deployed container shall be limited to a fixed memory cap and a fixed CPU share so that one application cannot starve another. |
| Organisational — implementation | The backend shall be written in Python with FastAPI and the frontend in Next.js, because these are the stacks the team is required to demonstrate. |
| Organisational — standards | All source shall live in a single Git repository, and no secret (OAuth client secret, session key) shall ever be committed. |
| External — interoperability | The platform shall run uploaded applications in Docker containers so that they behave identically on any machine with Docker installed. |
| External — privacy/legislative | Uploaded source code is the user's intellectual property and shall be accessible only to the authenticated owner and to users the owner has explicitly granted access. |

The organisational ones are worth mentioning in the viva precisely because students usually forget them — quoting "our stack is fixed by the course, which is an organisational requirement, not a product one" shows you understood the classification rather than memorised it.

## 1.5 Goals versus verifiable non-functional requirements

This is one of the highest-yield topics in the whole slide set, because it has a clean definition and a clean example pair.

The problem the slides raise: **non-functional requirements may be very difficult to state precisely, and imprecise requirements may be difficult to verify.** If you write "the system shall be easy to use," nobody can ever prove or disprove it. Two honest engineers can disagree forever.

So the slides split the idea into two:

A **goal** is a *general intention of the user*, such as ease of use. A goal cannot be tested, but it is still valuable, because **goals convey the intentions of the system users to developers.** A developer who knows the goal is "ease of use" will make a hundred small decisions correctly that no requirement document could have listed.

A **verifiable non-functional requirement** is *a statement using some measure that can be objectively tested*. It replaces the adjective with a number.

The slide example is the pair to memorise:

- **System goal:** "The system should be easy to use by experienced controllers and should be organised in such a way that user errors are minimised."
- **Verifiable non-functional requirement:** "Experienced controllers shall be able to use all the system functions after a total of two hours training. After this training, the average number of errors made by experienced users shall not exceed two per day."

Notice the transformation: *easy to use* became *two hours training*; *errors minimised* became *not more than two errors per day*. That is the whole technique — **find the adjective, replace it with a measure**.

### The measures table

The slides give a table of properties and the measures used for each. Learn at least two measures per property:

| Property | Measure |
|---|---|
| Speed | Processed transactions/second; user/event response time; screen refresh time |
| Size | Kbytes; number of RAM chips |
| Ease of use | Training time; number of help frames |
| Reliability | Mean time to failure; probability of unavailability; rate of failure occurrence; availability |
| Robustness | Time to restart after failure; percentage of events causing failure; probability of data corruption on failure |
| Portability | Percentage of target-dependent statements; number of target systems |

### How Silo used it

We can demonstrate this transformation on our own project, which is exactly what the examiner wants:

- **Our system goal:** "Deploying an AI-generated application should feel effortless — the user should not have to learn anything about containers."
- **Our verifiable non-functional requirement:** "A user shall be able to take a Python file from an AI assistant and obtain a running URL in a single upload, with zero configuration files authored by the user, and the static inference stage shall complete in under 500 ms."

And a second pair on reliability:

- **Goal:** "Deployments should be trustworthy."
- **Verifiable requirement:** "A version shall be reported *live* only after a successful TCP connection to its port, within a readiness timeout of 180 seconds; otherwise it shall be reported *failed* with its container output attached."

The second pair is worth telling as a story, because it came from a real bug. Docker publishes a host port the moment a container starts, whether or not anything is listening behind it. Our first version treated "container running" as "deployment successful," and a crashed application looked perfectly healthy. Converting the vague goal "deployments should be trustworthy" into the measurable requirement "a TCP connection must succeed" is precisely what fixed it. That is the *value* of verifiable requirements, told as an anecdote rather than a definition.

## 1.6 Imprecision, completeness and consistency

**Requirements imprecision** is the problem that arises when requirements are not precisely stated. Ambiguous requirements may be **interpreted in different ways by developers and users** — and the deadly property of ambiguity is that both sides believe they agree, so the disagreement is only discovered at delivery.

In principle, requirements should be both complete and consistent:

- **Complete** — they should include descriptions of **all** facilities required.
- **Consistent** — there should be **no conflicts or contradictions** in the descriptions of the system facilities.

And then the slides say the honest thing: **in practice, it is very difficult or impossible to produce a complete and consistent requirements document.** You should quote this, because it is a fact about real projects, not an excuse. Large systems have thousands of requirements written by many people over months, and the domain itself changes while you write.

### How Silo used it

We hit a genuine incompleteness and a genuine ambiguity, and admitting them is stronger than pretending we didn't.

**Incompleteness.** Our original requirements described "an uploaded Python application" and quietly assumed one file at the top of the archive. They never said what should happen when the archive contains a monorepo — a `backend/` folder, a `frontend/` folder, tests, migrations. When we tested with a real vibe-coded project, the build failed with `python: can't open file '/app/app.py'`, because the code was looking only at the top level and falling back to the literal string `app.py`. The requirement was not wrong; it was *incomplete*. We closed the gap by adding an explicit requirement: "the system shall select the application root by scoring candidate directories and shall search recursively for the entry point."

**Ambiguity.** "The system shall run the uploaded application" was ambiguous between `python file.py` and something else. For a Streamlit application, `python app.py` runs and exits doing nothing; Streamlit must be launched with `streamlit run`. For a FastAPI module with no `if __name__ == "__main__"` block, `python main.py` exits immediately, leaving a container that reports a successful start while serving nothing. The word "run" meant different things to us and to the framework. We removed the ambiguity by specifying that the system determines a **start command**, not merely an entry file, choosing between `python`, `uvicorn`, `gunicorn`, `streamlit run` and `django`.

**Consistency.** We also caught a real inconsistency: our proposal document specified a container limit of 256 MB and 0.5 CPU, while the implemented `builder.py` used 512 MB and 1.0 CPU. Two parts of our own documentation contradicted each other. This is exactly the kind of conflict the slide warns about, and we flagged it rather than letting it survive to the report.

## 1.7 User requirements and the problems with natural language

**User requirements** should describe functional and non-functional requirements so that they are **understandable by system users who don't have detailed technical domain knowledge**, and they are defined using **natural language, tables and diagrams**.

But natural language brings its own problems, and the slides list them in two places. From the user-requirements angle:

- **Lack of clarity** — precision is difficult without making the document difficult to read. There is a genuine trade-off: the more precise you make the prose, the more unreadable it becomes.
- **Requirements confusion** — functional and non-functional requirements tend to get mixed up in the same sentence.
- **Requirements amalgamation** — several different requirements get expressed together in one paragraph, so they cannot be tracked, tested or negotiated separately.

And from the specification angle:

- **Ambiguity** — readers and writers must interpret the same words the same way, and natural language is naturally ambiguous.
- **Over-flexibility** — the same thing may be said in many different ways, so the reader cannot tell whether two paragraphs mean the same requirement or two different ones.
- **Lack of modularisation** — natural-language structures (paragraphs, sections) are simply inadequate for structuring system requirements.

### Guidelines for writing requirements

The slides give four rules, and the second one is the one examiners quote:

1. **Invent a standard format** and use it for all requirements.
2. **Use language consistently:** use **shall** for mandatory requirements and **should** for desirable requirements.
3. **Use text highlighting** to identify key parts of the requirement.
4. **Avoid computer jargon.**

### How Silo used it

We adopted the standard format directly: every requirement in our SRS is one numbered sentence, in the form *"The system shall …"* or *"The user shall be able to …"*, with `shall` reserved strictly for mandatory items and `should` for desirable ones. For example, "The system **shall** rewrite a local-only host binding to 0.0.0.0 in the build copy" is mandatory; "The build log **should** be streamed to the browser as it is produced" is desirable and is currently implemented by polling instead.

We also fought requirements amalgamation deliberately. Our first draft had one paragraph saying the system "analyses the app, builds it, runs it and shows the logs." That is four requirements in one sentence, and none of them could be tested on its own. We split it into four numbered requirements, which is also why our test suite could be organised the way it is — one group of tests per requirement.

On jargon: our user requirements say "the platform works out what your program needs in order to run," while only the software specification says "the packaging module performs AST analysis to resolve third-party imports against a 93-entry import-to-package map."

## 1.8 Domain requirements

Domain requirements are **derived from the application domain** and describe system characteristics and features that **reflect that domain**. They may be new functional requirements, constraints on existing requirements, or definitions of specific computations. The critical line is: **if domain requirements are not satisfied, the system may be unworkable.** Not "worse" — unworkable. A railway system that ignores the domain rule about braking distance is not a slightly inferior railway system; it is a crash.

The slides give two problems with domain requirements:

- **Understandability** — the requirements are expressed in the language of the application domain, which the software engineers developing the system often do not understand.
- **Implicitness** — domain specialists understand their area so well that they **do not think of making the domain requirements explicit.** The requirement is invisible precisely because it is obvious to the expert. This is the harder of the two problems, because you cannot ask about a requirement you do not know exists.

### How Silo used it

Our domain is **the Python web application ecosystem**, and it imposed rules on us that no customer ever stated and that we only discovered by building:

- A **WSGI/ASGI application object is not a program**. `app = FastAPI()` in a module with no `__main__` guard is a *callable*, not something `python` can execute usefully. The domain rule is that ASGI applications must be launched by a server such as `uvicorn`, addressed as `module:variable`. This is an implicit domain requirement of exactly the kind the slide warns about — every Python web developer knows it, and nobody writes it down.
- A server bound to `127.0.0.1` is **unreachable from outside its own container**, because in the domain of container networking `localhost` means the container itself. A great many AI-generated apps hardcode `host="127.0.0.1"`, so our system must rewrite it to `0.0.0.0` in the build copy.
- **Import name ≠ package name.** You `import cv2` but install `opencv-python`; you `import PIL` but install `Pillow`. There is no rule that derives one from the other, so the domain forces us to carry an explicit mapping table (93 entries).
- **Standard-library modules must not be installed.** `import os` must not become `pip install os`. We must therefore know the standard-library module list (305 entries) as domain data.

If any of these four domain requirements is violated, Silo does not produce a slightly worse deployment — it produces a container that does not work at all. That is the "unworkable" clause of the slide, demonstrated on our own project.

## 1.9 Requirements interaction — conflicts between non-functional requirements

The slides state that **conflicts between different non-functional requirements are common in complex systems**, and give the spacecraft example: to minimise weight you minimise the number of separate chips; to minimise power consumption you use lower-power chips; but low-power chips may mean more chips are needed. The two non-functional requirements pull in opposite directions, and the slide ends with the question you must be ready to answer: **which is the most critical requirement?** The engineering answer is that you cannot satisfy both, so somebody must decide the priority — and that decision belongs to negotiation, which is covered in Part 2.

### How Silo used it

We had a clean, real conflict of exactly this shape.

- **Security requirement:** every uploaded application must run inside a container with a full, isolated environment, so untrusted AI-generated code cannot touch the host.
- **Performance requirement:** the user should get a live URL quickly.

At one point we added `apt-get install build-essential` to every generated Dockerfile, so that any package needing a C compiler would build successfully. That served **reliability** — more applications would build. But it added roughly 200 MB of downloads to *every single build*, so deployments appeared to hang in "building" for a very long time. Reliability and performance were in direct conflict.

Our resolution is the honest engineering answer: we refused to pick one globally and instead made the trade-off **conditional**. The compiler toolchain is now installed only when the resolved dependency list contains a package known to need it (`psycopg2`, `mysqlclient`, `lxml`, `cryptography`, `pyodbc`, and so on). Applications that need it pay the cost; applications that don't, don't. Being able to say "we had a genuine NFR conflict and here is how we resolved it rather than ignoring it" is worth a lot in a viva.

## 1.10 Requirements and design are inseparable

In principle, requirements should state **what** the system should do and the design should describe **how** it does this. In practice, the slides say, **requirements and design are inseparable**, for three reasons:

- A system **architecture may be designed to structure the requirements** — you organise the requirements around the components you expect to build.
- The system may **inter-operate with other systems** that generate design requirements — talking to an existing system forces design decisions on you.
- **The use of a specific design may itself be a domain requirement** — in some domains, a particular architecture is mandated.

### How Silo used it

All three appear in our project. Our requirements are organised by subsystem — authentication, application management, inference, build, proxy — which is an architectural structure imposed on the requirement list. Our decision to deploy through **Docker** is not a free design choice: it is forced by the requirement to run untrusted code in isolation, and it then generates further design requirements (we must publish ports, we must probe readiness, we must handle Compose projects). And our choice of **Google OAuth** as the only login method is a requirement that immediately dictates design: it forces a redirect/callback flow, a session cookie, and a `google_sub` column on the user table.

## 1.11 Users of a requirements document

The slides list five groups and what each does with the document. This is a small table but a very commonly asked one.

| Reader | What they use the requirements for |
|---|---|
| **System customers** | Specify the requirements and read them to check that they meet their needs; they specify changes to the requirements |
| **Managers** | Use the document to plan a bid for the system and to plan the system development process |
| **System engineers** | Use the requirements to understand what system is to be developed |
| **System test engineers** | Use the requirements to develop validation tests for the system |
| **System maintenance engineers** | Use the requirements to help understand the system and the relationships between its parts |

The insight worth stating aloud: **customers are the only group that writes as well as reads**; everybody else consumes. And maintenance engineers may read the document years later, which is the argument for writing it properly even when the team already knows what it means.

### How Silo used it

In our three-person team the roles collapsed onto us, which is normal for a student project and worth saying honestly. Dr. Nisha Thakur plays the **customer** role, reading the requirements and requesting changes. We act as **system engineers** when implementing. We acted as **test engineers** when we derived the automated test suite directly from the requirement list — each test group traces back to a requirement, which is exactly the use the slide describes. And we deliberately wrote the requirements for a future **maintenance engineer**: the documentation states not only what the inference engine does but why the strict/non-strict entry-point fallback exists, because the reason is not obvious from the code.

---
---

# PART 2 — REQUIREMENT GATHERING: THE 7-STEP MODEL (Slide Set 5)

The seven tasks are **Inception → Elicitation → Elaboration → Negotiation → Specification → Validation → Requirements Management.** Learn them in order; the sequence itself is an exam question. A useful way to remember what they do as a group: the first two *discover*, the middle two *shape*, the fifth *records*, the sixth *checks*, and the seventh *controls change forever afterwards*.

## 2.1 Inception

During inception the requirements engineer asks a set of questions to establish:

- a basic understanding of the problem,
- the people who want a solution,
- the nature of the solution that is desired,
- the effectiveness of preliminary communication and collaboration between customer and developer.

Through these questions the engineer needs to **identify the stakeholders, recognise multiple viewpoints, work toward collaboration, and break the ice and initiate communication.** That last one is not filler — inception is as much about establishing a working relationship as about gathering facts.

**The first set of questions** (memorise these four, they are quoted directly):

- Who is behind the request for this work?
- Who will use the solution?
- What will be the economic benefit of a successful solution?
- Is there another source for the solution that you need?

These questions focus on **the customer, other stakeholders, the overall goals, and the benefits**.

### How Silo used it

We answered those four questions explicitly for Silo:

- **Who is behind the request?** The problem owner is anyone who can now generate working code with an AI assistant but cannot deploy it. In our project the request is framed by the course, with Dr. Nisha Thakur as customer.
- **Who will use the solution?** Three distinct viewpoints, which is the "recognise multiple viewpoints" step in action: the **developer** who writes or generates the app, the **collaborator** who wants to change it without touching code, and the **approver**, a non-technical person who must decide whether it is safe to run.
- **What is the economic benefit?** The gap between "the AI wrote my app in 30 seconds" and "it took me three days to deploy it" is where all the value sits. Removing that gap is the benefit.
- **Is there another source for the solution?** Yes — Heroku, Railway, Render, Streamlit Cloud, Replit. Answering honestly here is what forced us to find our differentiator: those platforms all still require the user to understand configuration, and none of them tells a non-technical reviewer *what the code can do* before it runs. That gap became the nutrition-label idea.

Being able to say "we identified three stakeholder viewpoints at inception, not one" is exactly what the slide means by *recognise multiple viewpoints*.

## 2.2 Elicitation

Elicitation is drawing the requirements out. The slides begin by explaining **why it is difficult**, and the three problems are a classic question:

- **Problems of scope** — identifying the boundaries of the system, or specifying too much technical detail rather than overall system objectives.
- **Problems of understanding** — of what is wanted, what the problem domain is, and what the computing environment can handle. The slide adds the line that matters most: **information that is believed to be "obvious" is often omitted.**
- **Problems of volatility** — the requirements change over time.

Elicitation may be accomplished through two activities: **collaborative requirements gathering** and **quality function deployment**.

The elicitation workflow on the slides runs: elicit requirements → conduct FAST meetings → make lists of functions and classes, and lists of constraints → then a decision, **formal prioritisation?** → if **yes**, use **QFD** to prioritise requirements; if **no**, prioritise informally → then **create use cases** (define actors, write scenario, complete template, draw use-case diagram).

### Quality Function Deployment (QFD)

QFD is **a quality management technique that translates the needs of the customer into technical requirements for software.** It has four parts:

- **Function deployment** determines the "value" (as perceived by the customer) of each function required of the system.
- **Information deployment** identifies data objects and events.
- **Task deployment** examines the behaviour of the system.
- **Value analysis** determines the relative priority of requirements.

QFD identifies **three types of requirement**, and this three-way split is very frequently asked:

- **Normal requirements** — the objectives and goals stated for a product during meetings with the customer. **If present, the customer is satisfied.** Examples: requested types of graphical display, specific system functions, defined levels of performance.
- **Expected requirements** — implicit to the product, so fundamental that the customer does not explicitly state them. **Their absence causes significant dissatisfaction.** Examples: ease of human/machine interaction, overall operational correctness and reliability, ease of installation.
- **Exciting requirements** — features that go **beyond the customer's expectations** and prove very satisfying when present. The slide's example is a mobile phone shipping with unexpected capabilities such as multitouch and visual voicemail that delight the user.

The logic of the three is worth stating: normal requirements are what you *promised*, expected requirements are what you *must not get wrong even though nobody asked*, and exciting requirements are what makes anyone choose your product over an identical competitor.

### Elicitation work products

The slides list what elicitation should produce:

- a statement of need and feasibility;
- a bounded statement of scope for the system;
- a list of customers, users and other stakeholders who participated;
- a description of the system's technical environment;
- a list of requirements organised by function, and the domain constraints that apply to each;
- a set of preliminary usage scenarios, in the form of use cases;
- any prototypes developed to better define requirements.

### How Silo used it

We can map QFD's three requirement types straight onto Silo, and this is one of the best answers available for this section:

| QFD type | Silo requirement |
|---|---|
| **Normal** | Upload a Python app and get a live URL; see build logs; manage multiple apps and versions. These were stated openly and satisfy the customer when present. |
| **Expected** | Login must work and keep my code private; the platform must not lose my upload; the site must respond quickly; one user's app must not be able to read another's. Nobody ever asked for these, and their absence would sink the product. |
| **Exciting** | The **nutrition label** — a plain-English summary of what the uploaded code can actually do (which files it touches, which network hosts it contacts, whether it spawns processes) shown to a non-technical approver *before* the code runs. No competing platform does this. Also the **shared workbench**, where a non-programmer changes a running app by describing the change in English. |

We also produced the elicitation work products: a scope statement (Python web applications only — not Java, not arbitrary binaries), a stakeholder list (developer, collaborator, approver, owner/admin), a technical environment description (Docker, PostgreSQL, Python 3.11), a requirements list organised by function, and **preliminary usage scenarios in the form of six documented use cases** — which is precisely what the slide asks for.

On the *volatility* problem: our requirements genuinely changed during the project. "Run the app" became "determine a start command." "Find the entry point" became "find the application root, then the entry point." That is requirements volatility observed in the wild, not in theory.

## 2.3 Use cases (as an elicitation technique)

A use case is **a collection of user scenarios that describe the thread of usage of a system**. Each scenario is described **from the point of view of an "actor"** — a person or device that interacts with the software in some way.

Each scenario answers the following questions (these are the questions your use-case template must implicitly answer):

- Who is the primary actor, the secondary actor(s)?
- What are the actor's goals?
- What preconditions should exist before the story begins?
- What main tasks or functions are performed by the actor?
- What extensions might be considered as the story is described?
- What variations in the actor's interaction are possible?
- What system information will the actor acquire, produce, or change?
- Will the actor have to inform the system about changes in the external environment?
- What information does the actor desire from the system?
- Does the actor wish to be informed about unexpected changes?

### How Silo used it

We wrote **six** full use cases: UC-01 Submit App for Deployment, UC-02 Run Capability Analysis and Generate Nutrition Label, UC-03 Approve or Reject Deployment, UC-04 Deploy to Sandbox, UC-05 Request Change via AI in Shared Workbench, UC-06 Share App and Manage Access. Each one names a primary actor and secondary actors, states preconditions and postconditions, gives a numbered main success scenario, and then lists alternate flows and exceptions — which is exactly how the slide's ten questions get answered in practice. These are covered in detail in Part 7.

## 2.4 Elaboration

During elaboration the software engineer **takes the information obtained during inception and elicitation and begins to expand and refine it.** Elaboration focuses on developing a **refined technical model of software functions, features and constraints**.

The slides are explicit that **it is an analysis modelling task**, and list what happens:

- use cases are developed;
- domain classes are identified along with their attributes and relationships;
- state machine diagrams are used to capture the life of an object.

**The end result is an analysis model that defines the functional, informational and behavioural domains of the problem.** Those three words — functional, informational, behavioural — recur throughout the course and are worth memorising as a set.

### How Silo used it

Elaboration is where every diagram in Part 7 came from. We expanded the elicited requirements into:

- **Use cases** — six full specifications plus a use case diagram.
- **Domain classes with attributes and relationships** — `User`, `App`, `Version`, `BuildLog` as the domain classes, plus the service and router classes, with a composition chain `User ⋄— App ⋄— Version ⋄— BuildLog`.
- **The life of an object** — the `Version` object has a genuine lifecycle: `analysing → building → live` or `failed`. That status field is effectively a state machine, and it is the object whose life we would draw in a state diagram.

Our activity diagram, class diagram, sequence diagram, collaboration diagram and DFD are all elaboration products. That is the sentence to say if asked "where does elaboration appear in your project?"

## 2.5 Negotiation

During negotiation the software engineer **reconciles the conflicts between what the customer wants and what can be achieved given limited business resources.** The steps are:

- Requirements are **ranked (prioritised)** by customers, users and other stakeholders.
- **Risks** associated with each requirement are identified and analysed.
- **Rough guesses of development effort** are made and used to assess the impact of each requirement on project cost and delivery time.
- Using an **iterative approach**, requirements are eliminated, combined and/or modified **so that each party achieves some measure of satisfaction.**

That last phrase is the definition of a successful negotiation — not that one side wins, but that both sides get some satisfaction.

**The art of negotiation** (seven points, often asked as a list):

- Recognise that it is **not a competition**
- **Map out a strategy**
- **Listen actively**
- Focus on **the other party's interests**
- **Don't let it get personal**
- **Be creative**
- **Be ready to commit**

### How Silo used it

Our negotiation was internal — the team against a seven-week schedule and a three-person capacity — and it produced a genuinely reduced scope, which we should present honestly rather than hide.

**Ranking.** We ranked the deployment pipeline (upload → infer → build → run → proxy) as P0, because without it there is no product at all. The capability analysis and nutrition label came second. The approval workflow, gVisor sandboxing, egress allowlist and real-time collaborative workbench came third.

**Risk.** gVisor carries a high risk: it is a different container runtime, it does not run natively on Windows, and a failure there blocks every demo. Semgrep integration carries medium risk. The core pipeline carries low technical risk but high effort.

**Effort.** We estimated the inference engine alone at roughly two weeks of one person's time, which turned out to be accurate.

**The outcome.** We **eliminated** gVisor and the egress allowlist from the mid-semester scope, **modified** the collaborative workbench down to a frontend prototype rather than a real-time system, and **kept** the full deployment pipeline and the test suite. Each party — the technical ambition and the schedule — got some satisfaction. This is why our documentation clearly separates "implemented" from "proposed," and why the activity diagram for the proposal shows Semgrep and gVisor while the implementation does not yet contain them. Saying this out loud, with the reasoning, is far stronger than being caught out on it.

## 2.6 Specification

A specification is **the final work product produced by the requirements engineer.** It is normally in the form of a **software requirements specification (SRS)**. The slides say it:

- serves as the **foundation for subsequent software engineering activities**;
- describes the **function and performance** of a computer-based system and the **constraints** that will govern its development;
- **formalises the informational, functional and behavioural requirements** of the proposed software in **both a graphical and textual format**.

Note "graphical **and** textual" — the SRS is not only prose; the diagrams are part of the specification.

### Typical contents of an SRS

- **Requirements**
  - required states and modes
  - software requirements grouped by capabilities (functions, objects)
  - software external interface requirements
  - software internal interface requirements
  - software internal data requirements
  - other software requirements (safety, security, privacy, environment, hardware, software, communications, quality, personnel, training, logistics, etc.)
  - design and implementation constraints
- **Qualification provisions** to ensure each requirement has been met — demonstration, test, analysis, inspection
- **Requirements traceability** — trace back to the system or subsystem where each requirement applies

### How Silo used it

Our SRS maps onto those headings directly:

- **Required states and modes** — the version lifecycle: `analysing`, `building`, `live`, `failed`.
- **Requirements grouped by capability** — authentication, application management, version upload, inference, build and deployment, proxying, logging.
- **External interface requirements** — the Google OAuth 2.0 endpoints, and the Docker Engine API.
- **Internal interface requirements** — the REST contract between the Next.js frontend and the FastAPI backend, and the command-line contract of the build worker (`python -m silo_api.build_worker <version_id> <app_slug> <bundle_path>`).
- **Internal data requirements** — the four tables and their columns, plus the two data files `import_map.json` (93 entries) and `stdlib_modules.json` (305 entries).
- **Design and implementation constraints** — Python 3.11, FastAPI, Next.js 14, PostgreSQL, Docker; must run on Windows development machines.
- **Qualification provisions** — our automated test suite is the "test" form of qualification, and the five evaluation applications are the "demonstration" form.
- **Graphical format** — the use case, activity, class, sequence, collaboration and data flow diagrams are formally part of the specification, not decoration.

## 2.7 Validation

During validation the **work products produced as a result of requirements engineering are assessed for quality.** The specification is examined to ensure that:

- all software requirements have been stated **unambiguously**;
- **inconsistencies, omissions and errors** have been detected and corrected;
- the work products **conform to the standards** established for the process, the project and the product.

**The formal technical review serves as the primary requirements validation mechanism.** Members include software engineers, customers, users and other stakeholders. Say "formal technical review" if asked how requirements are validated — that is the expected term.

### The validation questions

These are asked as a list, so learn them as two groups.

**Group 1:**

- Is each requirement **consistent with the overall objective** for the system/product?
- Have all requirements been specified at the **proper level of abstraction** — do some provide technical detail inappropriate at this stage?
- Is the requirement **really necessary**, or is it an add-on feature not essential to the objective?
- Is each requirement **bounded and unambiguous**?
- Does each requirement have **attribution** — is a source (a specific individual) noted for it?

**Group 2:**

- Do any requirements **conflict** with other requirements?
- Is each requirement **achievable** in the technical environment that will house the system?
- Is each requirement **testable** once implemented? (Approaches: demonstration, actual test, analysis, inspection.)
- Does the requirements model properly reflect the **information, function and behaviour** of the system to be built?
- Has the requirements model been **"partitioned"** in a way that exposes progressively more detailed information about the system?

### How Silo used it

Our validation was a review inside the team plus review with the instructor — a formal technical review in the slide's sense, with the customer present.

Applying the questions caught real problems. **"Is each requirement testable?"** exposed that "the app should deploy successfully" was untestable as written, and drove it to "a TCP connection to the published port must succeed within the readiness timeout." **"Do any requirements conflict?"** caught the 256 MB / 512 MB contradiction between the proposal and the code. **"Is the requirement really necessary?"** removed several features from the mid-semester scope. **"Is each requirement achievable in the technical environment?"** is what killed gVisor for now — it is not achievable on our Windows development machines inside the schedule.

We also used the four qualification approaches: **test** for the automated suite, **demonstration** for the five evaluation applications, **analysis** for the timing measurements, and **inspection** for code review of the security-sensitive parts such as the zip path-traversal guard.

## 2.8 Requirements management

During requirements management the project team performs activities to **identify, control and track requirements and changes to requirements at any time as the project proceeds.** The mechanics:

- Each requirement is assigned a **unique identifier**.
- The requirements are placed into one or more **traceability tables**.
- These tables may be stored in a **database** relating features, sources, dependencies, subsystems and interfaces to the requirements.
- A **requirements traceability table** is also placed at the end of the SRS.

The purpose of traceability is to answer the question "if this requirement changes, what else is affected?" — and its mirror, "why does this piece of code exist?"

### How Silo used it

We assigned identifiers (FR-01…, NFR-01…, UC-01…) and traced them both ways. Forward: each requirement points at the module that implements it and the test that verifies it — for example, the requirement about local-only host bindings points at `repair_host_binding()` in `packaging.py` and at the corresponding test. Backward: each use case maps to the routes that realise it, so UC-01 maps to `versions.py`, UC-04 maps to `builder.py`, `packaging.py` and `compose.py`.

Git is our change-control mechanism: every change to code or requirements is a commit with a message, so the history of a requirement is recoverable. That is a lightweight version of the database the slide describes, and it is honest to describe it that way.

---
---

# PART 3 — ANALYSIS MODELLING (Slide Set 6)

## 3.1 Why analysis modelling

The slides give seven reasons, and they read as a list of *benefits*, so learn them as benefits:

- Provides the **first technical representation** of a system.
- Is **easy to understand and maintain**.
- **Deals with the problem of size by partitioning** the system.
- **Uses graphics** whenever possible.
- **Differentiates between essential information and implementation information.**
- Helps in the **tracking and evaluation of interfaces**.
- Provides **tools other than narrative text** to describe software logic and policy.

The two most quotable are *partitioning to deal with size* and *separating essential from implementation information*. The first is why big systems are drawn as a hierarchy of diagrams rather than one enormous picture; the second is why an analysis model says "the system stores the version" rather than "the system runs an INSERT into a PostgreSQL table."

## 3.2 Purpose of requirements analysis

Requirements analysis:

- specifies the software's **operational characteristics**;
- indicates the software's **interfaces with other system elements**;
- establishes the **constraints** the software must meet;
- provides the software designer with a **representation of information, function and behaviour** — which is **later translated into architectural, interface, class/data and component-level designs**;
- provides the developer and customer with the means to **assess quality once the software is built**.

That fourth point is the bridge between analysis and design, and it is worth stating as a chain: *information, function and behaviour* → *architectural, interface, class/data and component-level design*.

## 3.3 Who carries out requirements analysis

The person who undertakes requirements analysis and specification is known as the **systems analyst**. The analyst:

- collects data pertaining to the product;
- analyses the collected data **to understand what exactly needs to be done**;
- writes the **Software Requirements Specification (SRS)** document.

In our three-person team all three of us shared the systems-analyst role, with the work split by subsystem.

## 3.4 The four modelling approaches

This set of four is asked constantly. Learn one sentence each.

- **Flow-oriented modelling** — provides an indication of **how data objects are transformed by a set of processing functions.** (Data moving and being transformed.)
- **Scenario-based modelling** — represents the system **from the user's point of view.** (What the user does.)
- **Class-based modelling** — defines **objects, attributes and relationships.** (What things exist.)
- **Behavioural modelling** — depicts the **states of the classes and the impact of events on these states.** (How things change over time.)

A quick way to hold them together: *scenario* = the user's view, *class* = the structure, *flow* = the data, *behaviour* = the time dimension.

## 3.5 Elements of the analysis model

This table appears twice in the slide set, which means it is important.

| Modelling category | Elements |
|---|---|
| **Scenario-based modelling** | Use case text, use case diagrams, activity diagrams, swim lane diagrams |
| **Class-based modelling** | Class diagrams, analysis packages, CRC models, collaboration diagrams |
| **Flow-oriented modelling** | Data structure diagrams, data flow diagrams, control-flow diagrams, processing narratives |
| **Behavioural modelling** | State diagrams, sequence diagrams |

The diagram in the slides also draws an axis across this table: the left-hand side (flow-oriented) belongs to **structured analysis**, and the right-hand side (scenario- and class-based) belongs to **object-oriented analysis**.

### How Silo used it

We produced elements from **all four** categories, which is worth stating directly because most student projects only produce two:

| Category | Our artefact |
|---|---|
| Scenario-based | Six use case texts, a use case diagram, and a **swim lane activity diagram** |
| Class-based | A class diagram and a **collaboration (communication) diagram** |
| Flow-oriented | A **data flow diagram** with processes, data stores and external entities |
| Behavioural | A **sequence diagram**; and the `Version` status field (`analysing → building → live/failed`) is the state model |

## 3.6 Structured versus object-oriented analysis

**Structured analysis** considers **data and the processes that transform the data as separate entities.** Data is modelled in terms of **only attributes and relationships — but no operations.** Processes are modelled to show three things: (1) the input data, (2) the transformation that occurs on that data, and (3) the resulting output data.

**Object-oriented analysis** focuses on the **definition of classes and the manner in which they collaborate with one another** to fulfil customer requirements.

The one-line contrast to give in a viva: *structured analysis separates data from the operations on it; object-oriented analysis binds them together inside classes.*

### How Silo used it

We used **both**, deliberately, and can justify it. Our **DFD** is a structured-analysis artefact: it shows `Apps and Versions` and `Capability Manifests` as passive data stores holding attributes only, with processes such as *Analyse Capabilities* transforming input into output. Our **class diagram and collaboration diagram** are object-oriented artefacts: `Version` is not passive data but a class with its own attributes, and `Builder` is a class with the operations `run_build()` and `wait_for_port()`.

Using both is not confusion — the DFD answers "where does the data go?" and the class diagram answers "what are the objects and who calls whom?", and those are different questions.

## 3.7 Flow-oriented modelling: data modelling and flows

**Data modelling** requires you to identify four things: **data objects (entities), data attributes, relationships, and cardinality** (number of occurrences).

**Data flow and control flow:**

- A **data flow diagram** depicts **how input is transformed into output as data objects move through a system.**
- A **process specification** describes data-flow processing **at the lowest level of refinement** in the DFD.
- A **control flow diagram** illustrates **how events affect the behaviour of a system** through the use of state diagrams.

**Diagram layering and process refinement** runs: **context-level diagram → level-1 diagram → process specification.** You start with one bubble for the whole system and refine downwards until a process is simple enough to describe in a paragraph.

### How Silo used it

Our data model identifies four entities (`User`, `App`, `Version`, `BuildLog`), their attributes, their relationships, and their cardinality — one user to many apps, one app to many versions, one version to many build logs. Our DFD is a level-1 diagram; the context diagram above it would be a single *Silo Platform* bubble between the Owner, Collaborator and Admin entities. Full discussion is in Part 7.

## 3.8 Scenario-based modelling: writing use cases

It is effective to use the **first person "I"** to describe how the actor interacts with the software. The format of the text part of a use case is:

```
Use-case title:
Actor:
Description: I …
```

## 3.9 Activity diagrams (as an analysis-model element)

An activity diagram **supplements the use case by providing a graphical representation of the flow of interaction within a specific scenario.** Note the relationship: the use case is the *text*, the activity diagram is the *picture of one scenario from it*.

It uses flowchart-like symbols:

- **Rounded rectangle** — represents a specific system function/action
- **Arrow** — represents the flow of control from one function/action to another
- **Diamond** — represents a branching decision
- **Solid bar** — represents the **fork and join of parallel activities**

The solid bar is the one symbol that distinguishes an activity diagram from an ordinary flowchart, because flowcharts cannot express parallelism. Our own activity diagram uses it, which is covered in Part 7.

## 3.10 Class-based modelling

### Identifying analysis classes

The technique is grammatical: **classes are determined by underlining each noun or noun clause** in the requirements text. And the rule that follows: **a class should NOT have an imperative procedural name** — that is, a class should not be named with a verb. If your candidate class is called "Validate" or "Process," it is an operation, not a class.

**General classifications for a class** (seven categories, frequently asked):

- **External entity** — another system, a device, a person
- **Thing** — a report, a screen display
- **Occurrence or event** — a movement, a completion
- **Role** — manager, engineer, salesperson
- **Organizational unit** — division, group, team
- **Place** — manufacturing floor, loading dock
- **Structure** — sensor, vehicle, computer

### Attributes

**Attributes of a class are those nouns from the grammatical parse that reasonably belong to a class.** Attributes **hold the values that describe the current properties or state of a class.**

### Operations

**Operations define the behaviour of an object.** There are **four categories of operation**, and this list is a favourite exam item:

1. Operations that **manipulate data in some way to change the state of an object** — add, delete, modify.
2. Operations that **perform a computation**.
3. Operations that **inquire about the state of an object**.
4. Operations that **monitor an object for the occurrence of a controlling event**.

### How Silo used it

We applied the noun-underlining technique to our own requirements text. Underlining the nouns in *"A **user** uploads an **application** as a new **version**; the **system** analyses it, builds an **image**, runs a **container**, and records **build logs**"* yields the candidate classes `User`, `App`, `Version`, `BuildLog` — which are exactly the four domain classes in our class diagram.

Classifying them by the seven categories: `User` is a **role**; `App` and `Version` are **things**; `BuildLog` is an **occurrence or event**; `Docker Engine` is an **external entity**.

Our operations cover all four categories: `create_app()` and `upload_version()` **manipulate data to change state**; `make_plan()` and `render_dockerfile()` **perform a computation**; `list_versions()` and `get_version_logs()` **inquire about state**; and `wait_for_port()` **monitors for the occurrence of a controlling event** — it watches for the event "the port started responding." Being able to name a category-4 operation in your own code is a strong answer, because most projects do not have one.

### Association, generalization and dependency (Fowler)

- **Association** — represented by a **solid line** between two classes, directed from the source class to the target class. Used for representing (pointing to) object types for attributes. May also be a **part-of relationship (aggregation)**, represented by a **diamond-arrow**.
- **Generalization** — portrays **inheritance between a superclass and a subclass**; represented by a **line with a triangle at the target end**.
- **Dependency** — exists between two elements if **changes to the definition of one element (the source or supplier) may cause changes to the other element (the client)**. Examples: one class calls a method of another class; one class uses another class as a parameter of a method.

## 3.11 Behavioural modelling

**Creating a behavioural model** has two steps:

1. **Identify events** found within the use cases and implied by the attributes in the class diagrams.
2. **Build a state diagram** for each class, and if useful, for the whole software system.

**Identifying events in use cases:** an event occurs **whenever an actor and the system exchange information.** Some events have an explicit impact on the flow of control, while others do not.

**Building a state diagram:**

- A **state** is represented by a **rounded rectangle**.
- A **transition (event)** is represented by a **labelled arrow** leading from one state to another.
- The syntax of a transition is **`trigger-signature [guard] / activity`**.

The slide's example is a stack with states *Empty Stack*, *Partially Filled Stack* and *Full Stack*, with transitions such as `push [n = 0]` and `pop / set n to 0; return error`.

### How Silo used it

Applying step 1 to our use cases, the events where an actor and the system exchange information are: *upload submitted*, *analysis completed*, *approval granted*, *approval rejected*, *port responded*, *readiness timeout expired*, *logs requested*.

Applying step 2, the `Version` class has the clearest lifecycle in our system, and it maps onto a state diagram directly:

- **Analysing** — set on upload
- **Building** — entered when the build worker starts, guarded by `[analysis succeeded]`
- **Live** — entered on the event *port responded*, i.e. `probe_success [connection established] / record internal_port`
- **Failed** — entered from either state on the events *analysis failed*, *build failed*, or *readiness timeout*, with the activity *attach build output*

Being able to write one transition in the exact `trigger [guard] / activity` syntax — for example `probe_success [tcp connect ok] / set status = live; record port` — is a precise, high-value answer.

---
---

# PART 4 — INTRODUCTION TO UML (Slide Set 7)

## 4.1 Modelling

**Models are abstractions that portray the essentials of a complex problem or structure by filtering out non-essential details.** A model describes a system at a **high level of abstraction** and is used for requirements and specifications. **Models help us organize, visualize, understand and create complex things.**

The word doing the work is **filtering**. A model is defined by what it leaves out. A map that showed every blade of grass would be useless as a map.

The slides also give the definition worth quoting verbatim: **"A model is an abstraction of a system, specifying the modeled system from a certain viewpoint and at a certain level of abstraction."** Two qualifiers — *viewpoint* and *level of abstraction* — and both are needed. The plumbing diagram and the electrical diagram of the same building are different viewpoints; the exterior sketch and the detailed electrical plan are different levels of abstraction.

**Why model software systems:** models help us **visualize and understand** the system we're building; models are used to **document the design and communicate it to others**; models **serve as a guide during system construction**.

## 4.2 What UML is and why we use it

**UML stands for Unified Modeling Language.** It is an **industry-standard graphical language for specifying, visualizing, constructing and documenting the artifacts of an object-oriented system under development.** It uses **mostly graphical notations** to express the OO analysis and design of software projects, and it **simplifies the complex process of software design.**

**Why UML for modelling:**

- Uses **graphical notation to communicate more clearly than natural language (imprecise) and code (too detailed).**
- Helps **acquire an overall view of a system.**
- Is **not dependent on any one language or technology.**
- **Moves us from fragmentation to standardization.**

The first point is the strongest argument and worth repeating in your own words: natural language is too vague to build from and code is too detailed to reason about; UML sits in the useful middle.

**History:** in the 1990s many different methodologies with their own notations were introduced — **Object Modeling Technique (OMT) by James Rumbaugh**, the **Booch method by Grady Booch**, and **Object-Oriented Software Engineering (OOSE) by Ivar Jacobson.** UML unified these three, which is where "Unified" comes from. The three are sometimes called the "three amigos."

## 4.3 The UML diagrams

The slide set lists, split around the MST:

**Before MST:** use case diagram, activity diagram, class diagram, sequence diagram, collaboration diagram, state diagram.
**After MST:** object diagram, component diagram, deployment diagram.

The class-diagram slide set gives a cleaner three-way grouping:

- **Structural diagrams** — **Class** (static class structure), **Object** (runtime object structure)
- **Behavioral diagrams** — **Use Case** (interaction between system and its environment), **Communication** (dynamic message passing between objects), **Sequence** (dynamic message passing between objects), **State** (object states and transitions), **Activity** (algorithmic processes)
- **Physical diagrams** — **Component** (physical packaging of the system as source and deployment files), **Deployment** (physical deployment of the system on nodes)

Note that **Communication and Sequence have the same definition** — both are "dynamic message passing between objects." They show the same information with different emphasis: sequence emphasises *time*, communication emphasises *structure*. This is a very common exam question and is discussed properly in Part 7.

## 4.4 Different ways of using UML

- **Conceptual modelling** (a.k.a. domain modelling)
- **Software modelling**
- **Sketching** — whiteboard discussion, document figures
- **Blueprints** — designers create UML models to guide construction; **more complete than sketches**
- **Programming language** — execute UML models directly
- **Forward engineering** — model first, then generate code
- **Reverse engineering** — code first, then recover the model

### How Silo used it

Honest answer: we used UML in **two** of these modes. During design discussions we used it as **sketching**. For the report, most of our diagrams are **blueprints** — complete enough to guide construction, with real class names, real method names and real relationships. And two of our diagrams are partly **reverse engineering**, because we drew the class diagram from code that already existed, recovering the model from the implementation. Saying which mode each diagram belongs to is a sophisticated answer.

## 4.5 Use case diagrams — full notation

**A use case diagram establishes the capability of the system as a whole.** Its components are: **actor, use case, system boundary, relationship, actor relationship.**

### Actor

**An actor is someone or something that must interact with the system under development.** The UML notation for an actor is a **stickman**.

More about actors:

- It is a **role a user plays with respect to the system** — not a specific person. The same person may be two actors; two people may be the same actor.
- **Actors are not part of the system**; they represent anyone or anything that must interact with it.
- **Actors carry out use cases, and a single actor may perform more than one use case.**
- Actors are determined by **observing the direct uses of the system**, and include those responsible for its use and maintenance as well as other systems that interact with the developed system.

**An actor may:** input information to the system; receive information from the system; input to and output from the system.

**How to find actors** — ask:

- Who uses the system?
- Who installs the system?
- Who starts up the system?
- What other systems use this system?
- Who gets information from the system?
- Who provides information to the system?

And the rule: **an actor is always external to the system. They are never part of the system to be developed.**

**Four categories of actor:**

1. **Primary actor** — who uses the main system functions.
2. **Secondary actor** — who takes care of administration and maintenance.
3. **External hardware** — the hardware devices which are part of the application domain and must be used.
4. **Other system** — the other system with which the system must interact.

### Use case

**A use case is a pattern of behaviour the system exhibits.** Each use case is **a sequence of related transactions performed by an actor and the system in dialogue.** The slide's compressed definition: **a USE CASE is a dialogue between an actor and the system.** Examples given: *Open new account*, *Withdrawal of cash from ATM*.

### System boundary

- Shown as a **rectangle**.
- Helps identify **what is external versus internal**, and what the **responsibilities of the system** are.
- **The external environment is represented only by actors.**

### Relationships between use cases

**«includes»** — the arrow is towards the **secondary** use case. Used when **multiple use cases share a piece of the same functionality**; that functionality is placed in a separate use case **rather than documenting it in every use case that needs it.** So «includes» shows **behaviour that is common to one or more use cases**. The behaviour is **always** performed.

**«extends»** — the arrow is towards the **primary** use case. Used to show **optional behaviour, which is required only under certain conditions.** The slide's example: *Order* and *Rush Order* — a Rush Order is a special/optional case of Order; a normal order is served within 30 minutes, and the user may instead select Rush Order, served within 10 minutes for Rs. 100 extra.

The arrow-direction rule is the thing people get wrong, so hold on to it: **include points away from the base use case towards the shared one; extend points from the optional one back towards the base.**

### Generalisation

**Actors and use cases can be generalised, showing that one is simply a special case of the other.** This is **like inheritance in object-oriented design.** The slide's example: *borrow book* and *borrow CD*, with a *Borrower: books only* actor generalised into *Borrower: books and CDs*, because borrowing a CD requires additional registration and payment per CD.

### The worked ATM example

The slide shows the *Withdraw Cash* diagram: actors **Customer**, **Clerk**, **Manager** and **ATM DB**; use cases *Withdraw cash*, *Validation* («includes»), and *Balance status report* («extends»).

### Flow of events and the use case template

The slides distinguish three flows, and the distinction is examinable:

- **Typical course of events / successful scenario / normal scenario** — the main path where everything works. The ATM example numbers 17 steps, each tagged **(AA)** Actor Action, **(SR)** System Response or **(SA)** System Action.
- **Alternative flow of events** — a valid but different path chosen by the user. The slide's example: at step 9 the ATM asks for the amount, and *the user has a change of mind and hits "cancel."* Nothing has gone wrong; the user simply chose differently.
- **Exceptional flow of events** — something has gone wrong. The slide's examples: *suspicious pattern of usage on the card* at step 3, *the machine is out of cash* at step 10, *money gets stuck in the machine* at step 11.

The one-line distinction: **alternative = a different valid path; exceptional = an error or abnormal condition.**

**Generic format for documenting a use case:**

- **Pre-condition** (if any)
- **Use case** — name of the case
- **Actors** — list of actors (external agents), indicating who initiates the use case
- **Purpose** — intention of the use case
- **Overview** — description
- **Type** — primary / secondary
- **Typical course of events** — with numbered **ACTOR ACTION (AA)**, **SYSTEM RESPONSE (SR)** and **SYSTEM ACTION (SA)**
- **Exceptional flow of events / extension points**
- **Alternate flow**
- **Post-condition** (if any)

## 4.6 Activity diagrams — full notation

Activity diagrams are:

- a technique to describe **procedural logic, business process and work flow**;
- **similar to flowcharts, but the latter does not support parallel behaviour** — this is the key difference and is asked directly;
- used to **model a specific use case at a more detailed level**.

**States** have transitions to other states and may be either **action states** (atomic action) or **activity states** (actions that can be broken down). They may have **decisions**, explained by conditions, and **merges**; and **forks and joins** for modelling simultaneous activities.

**Notation:**

- **Action/Activity** — long rounded rectangle
- **Start / initial state** — **unique**, with **only one transition line**
- **End state** — **not necessarily unique** (a diagram may have several end states)
- **Transition** — lines indicating sequential flow of actions; **must be labelled after a decision**; arrows indicate the direction of the next action
- **Condition** — the guard on a transition

**Decision points and guards:**

- A decision point is a **diamond**, with a **single entry transition line** and **multiple exit transition lines**, each with a **guard (condition)**.
- **The exit lines must cover all eventualities.** The slide poses this as a question about a diagram with `[rainy]` and `[sunny]` guards — the problem is that the guards do **not cover all eventualities**; there is no path for weather that is neither. This is the intended answer.

**Merge points:**

- A merge is also a **diamond**, used to indicate a merge **after a decision**.
- **Multiple entry, single exit.**
- In UML1, more than one transition line could enter an activity; **in UML2 you must use merge diamonds.**

**Synchronisation** — sometimes certain action sequences can be done in parallel:

- **Fork** — shows the **start** of concurrent actions; the thread within each exit can execute at the same time as the other; **single entry, multiple exits.**
- **Join** — shows the **end** of concurrent actions; **the exit cannot occur until all entry threads have completed**; **multiple entry, single exit.**

The slide's online-shopping example makes the meaning concrete: the **fork** shows the collection slip can be printed at the same time as the items are picked; the **join** shows you cannot collect the items until *both* the slip has been printed *and* the items have been picked and sent for collection.

**Swimlanes / partitions:**

- Useful to **model an activity's procedural flow of control between objects.**
- Use **vertical columns**.
- Place the **object's name at the top of the column**.
- Place **each action associated with an object in that object's swimlane**.

The slides give two swimlane examples: online shopping with *Member / Warehouse staff / Till staff*, and a student admission procedure with *Academic Section / Accounts Section / Hostel Office / Hospital / Department*. Our own activity diagram follows this second pattern exactly, which is covered in Part 7.

---
---

# PART 5 — PROCESS MODELLING AND DATA FLOW DIAGRAMS

## 5.1 Process modelling

Process modelling means **modelling a system's processes**, utilising information gathered during requirements determination. **The structure of the data is also modelled in addition to the processes.** It **graphically represents the processes that capture, manipulate, store and distribute data between a system and its environment and among system components.**

**Data flow diagrams (DFD)** graphically illustrate the **movement of data between external entities and the processes and data stores within a system.**

**Deliverables and outcomes:**

- A set of **coherent, interrelated data flow diagrams**
- A **context DFD** — the **scope** of the system
- **DFDs of the current system** — enabling analysts to understand the current system
- **DFDs of the new logical system** — **technology independent**, showing data flows, structure and functional requirements of the new system
- A **project dictionary and CASE repository**

"Technology independent" is the important qualifier: a logical DFD says *store the version*, never *write a row to PostgreSQL*.

## 5.2 The four symbols

| Symbol | Drawn as | Meaning |
|---|---|---|
| **Data flow** | An **arrow** | Data **in motion**, moving as a unit from one place to another in the system. Select a meaningful name to represent the data. |
| **Data store** | **Two horizontal parallel lines** | Data **at rest**. May represent data in a file folder, a computer-based file, or a notebook. The **name and the number** are recorded between the lines. |
| **Process** | A **circle** | **Work or action performed on data** so that they are transformed, stored or distributed. The **number and the name** are recorded. |
| **Source / sink** | A **square** | The **origin and/or destination** of the data. Sometimes called an **external entity**. Because they are external, many of their characteristics are not of interest to us. |

The cleanest way to hold the first two apart: **data flow = data in motion; data store = data at rest.**

## 5.3 Context, level-1 and level-N diagrams

A **context diagram** is a DFD **of the scope of an organizational system** that shows the **system boundaries**, the **external entities that interact with the system**, and the **major information flows between the entities and the system**. It contains exactly one process — the whole system.

A **level-1 diagram** represents the **system's major processes, data flows and data stores at a higher level** of detail.

**Decomposition of DFDs:**

- **Functional decomposition** is the **act of going from one single system to many component processes.** It is a **repetitive procedure**.
- The **lowest level is called a primitive DFD**.
- A **level-N diagram** is a DFD that is the result of **n nested decompositions** of a series of subprocesses from a process on a level-0 diagram.

## 5.4 Balancing

**When decomposing a DFD, you must conserve inputs to and outputs from a process at the next level of decomposition. This is called balancing.**

The slide's example is King's Burgers: one input to the system (**customer order**) and three outputs (**customer receipt, food order, management reports**). If the level-1 diagram has the same inputs and outputs — no new ones introduced — then the context diagram and the level-1 DFD are **balanced**.

The **unbalanced example**: the context diagram has one input **A** and one output **B**, but the level-1 diagram has **one additional data flow C**. That extra flow is the imbalance.

Balancing is essentially a conservation law: **data cannot appear or disappear when you zoom in.**

## 5.5 The DFD rules

The slides name these A to T. Group them by the symbol they constrain, which makes them far easier to recall.

**General**

- Inputs to a process are **always different** from outputs (a process must transform the data).
- Objects always have a **unique name**. To keep the diagram uncluttered, you may **repeat data stores and data flows** on a diagram.

**Process rules**

- **A.** No process can have **only outputs** — this is called a **miracle**.
- **B.** No process can have **only inputs** — this is called a **black hole**.
- **C.** A process has a **verb phrase label** (except for the context diagram).

**Data store rules**

- **D.** Data **cannot be moved directly from one store to another**.
- **E.** Data **cannot move from an outside source directly to a data store**.
- **F.** Data **cannot move directly from a data store to a data sink**.
- **G.** A data store has a **noun phrase label**.

The reason behind D, E and F is the same in each case: data stores are passive. Something must *do* the moving, and that something is a process.

**Source/sink rules**

- **H.** Data **cannot move directly from a source to a sink** (if it did, it would not involve the system at all).
- **I.** A source/sink has a **noun phrase label**.

**Data flow rules**

- **J.** A data flow has **only one direction of flow** between symbols.
- **K.** A **fork** means that **exactly the same data** go from a common location to two or more processes, data stores or sources/sinks.
- **L.** A **join** means that **exactly the same data** come from two or more different processes, data stores or sources/sinks to a common location.
- **M.** A data flow **cannot go directly back to the same process it leaves**.
- **N.** A data flow **to** a data store means **update** (delete or change).
- **O.** A data flow **from** a data store means **retrieve or use**.
- **P.** A data flow has a **noun phrase label**.

**Advanced rules**

- **Q.** A **composite data flow on one level can be split into component data flows at the next level**, BUT **no new data can be added** and **all data in the composite must be accounted for** in one or more sub-flows.
- **R.** The **inputs to a process must be sufficient to produce the outputs** from the process.
- **S.** At the **lowest level** of DFDs, **new data flows may be added to represent data transmitted under exceptional conditions** (e.g. error messages).
- **T.** To **avoid having data flow lines cross each other, you may repeat data stores or sources/sinks** on a DFD.

**A common DFD error** the slides call out explicitly: **representing a process as a sink/source.**

Two memorisable pairs: **miracle (outputs only) / black hole (inputs only)**, and **processes take verb phrases / stores and sources take noun phrases.**

---
---

# PART 6 — UML CLASS DIAGRAMS (Dr. Ashima Singh's set)

## 6.1 Complexity and abstraction

**Modeling is a well-accepted engineering technique for dealing with complexity.** Models let us **focus on one view of the system while ignoring irrelevant details** — a simplification of reality. The slide's analogy: plumbers only care about plumbing, so we give them plumbing diagrams; electricians only care about electrical work, so we give them electrical diagrams.

**Models can be created at different levels of abstraction** — a 10,000-foot view versus a 10-foot view. High-level: a sketch of the building's exterior for the customer. Low-level: a detailed electrical plan for the electrician.

## 6.2 Class diagram contents

**Class diagrams show the kinds of objects in a system and the static relationships between them.** The word **static** matters: a class diagram shows what is *always* true about the structure, not what happens at a particular moment.

Contents:

- **Classes** — with **attributes** and **operations**
- **Relationships** — **association** (with **aggregation** and **composition** as special kinds), **generalization**, and **dependency**

## 6.3 Class notation and visibility

A class is drawn as a rectangle with three compartments: **name, attributes, operations.**

```
ClassName
- attrName1 : type1 [n] = default
+ attrName2 : type2 [*] = default
# attrName3 : type3 [n..m] = default
- opName1(in param1 : type1, out param2 : type2) : returntype
+ opName2(inout param3 : type3) : returntype
# opName3() : returntype
```

**Visibility markers:**

- **`-` private**
- **`+` public**
- **`#` protected**

**Parameter direction types:** **in, out, inout.**

The slide's SafeHome example shows a `Component` class with `+ componentID`, `- telephoneNumber`, `- componentStatus`, `- delayTime`, `- masterPassword`, `- numberOfTries` and operations `+ program()`, `+ display()`, `+ reset()`, `+ query()`, `- modify()`, `+ call()`.

## 6.4 The relationships in detail

### Association

**Association is a structural relationship specifying that objects of one class are connected to objects of another class.** If there is an association between class A and class B, **you can navigate from an object of type A to an object of type B, and vice versa.** From an Order you can get to its Customer; from a Customer you can get to its Orders.

Four refinements:

- **Navigation** — an **arrowhead** may be used to **limit navigation to only one direction**.
- **Association name and direction arrow** — an association may be given a name and a direction arrow indicating how to read the name, e.g. `Person —works for→ Company`.
- **Role names** — each end may be given a **role name**, indicating the role played by that class in the association. This is **different from naming the association itself**. Example: `Person [employee] ———— [employer] Company`.
- **Multiplicity** — each end may be given a multiplicity. **The multiplicity at one end indicates how many objects of that type are connected to each individual object at the other end.** Example: a Company has one or more employees (`1..*`), a Person works for zero or more companies (`*`).

**Ways to specify multiplicity:** a **constant number** (e.g. 3); an **asterisk `*`** meaning any number (zero or more); **N..M** specifying a range (e.g. `1..*`).

The multiplicity-reading rule catches people out: you read the number at the **far** end to learn how many partners **one** object at the near end has.

### Aggregation

**Aggregation is a special kind of association representing a "whole/part" relationship.** The end with the **diamond is the whole**; the end **without the diamond is the part**.

### Composition

Like aggregation, composition represents a **"whole/part" relationship**, but **composition is used when the part does not exist independently from the whole.** The slide's example: a **Department does not exist independently of its Company, but an Employee does.** And the rule: **the multiplicity on the "whole" end of a composition should always be 1, because a part can belong to only one whole.**

The test to apply: *if I destroy the whole, does the part still make sense?* If no, it is composition; if yes, aggregation.

### Generalization

Used to represent an **"is-a" relationship** between two classes — a Dog "is-a" Animal, a Truck "is-a" Vehicle. Used to show **inheritance** relationships in software models. The **subclass inherits attributes and operations from the superclass.**

### Dependency

**Class A depends on class B if A "uses" B.** Common "uses" relationships:

- an operation on A has a **parameter** of type B;
- an operation on A has a **return value** of type B;
- an operation on A has a **local variable** of type B;
- an operation on A accesses **static members** of B;
- an operation on A accesses a **global variable** of type B.

**If B is changed, A might also have to change.** That consequence is the whole reason dependency is worth drawing.

### The elevator example

The slide's worked example is worth knowing because it shows constraints in braces: a `Building` composed of `1..*` `Floor`s and `1..*` `Elevator`s; `Elevator Button` and `Floor Button` generalising `Button`; and the constraints *{An Elevator has a button for each Floor}*, *{A Floor has one Down button and one Up button}*, and *{A Person is always associated with a Floor or an Elevator, but never both at the same time}*.

---
---

# PART 7 — OUR PROJECT DIAGRAMS, EXPLAINED

This part takes each diagram we produced, states the theory it comes from, walks through what it actually shows, and lists the questions likely to be asked about it.

---

## 7.1 Use Case Diagram

### The theory behind it

From Slide Set 7: a use case diagram **establishes the capability of the system as a whole**, and its components are **actor, use case, system boundary, relationship and actor relationship.** From Slide Set 6, it is a **scenario-based modelling** element. From Slide Set 5, drawing the use case diagram is the **final step of elicitation**, after defining actors, writing the scenario and completing the template.

### What our diagram shows

**Actors (all external to the system, all roles rather than people):**

- **Developer** — the person who writes or AI-generates the application and submits it. **Primary actor**, because they use the main system functions.
- **Collaborator** — an editor on a shared draft who changes the app without writing code. **Primary actor** for the workbench functions.
- **Approver** — a non-technical reviewer who decides whether a deployment may proceed. **Primary actor** for the review functions.
- **Owner / Admin** — manages sharing, roles, audit and revocation. **Secondary actor** in the slide's sense, because this role takes care of administration and maintenance.
- **External Data Source** — **"other system"** in the slide's four-category classification: an outside system our platform must interact with through the capability broker.

**System boundary:** the rectangle labelled **Silo Platform**. Everything inside is our responsibility; everything outside is an actor. This is exactly the slide's statement that the boundary "helps identify what is external versus internal, and what the responsibilities of the system are."

**Use cases inside the boundary,** grouped by the area they belong to: *Submit App for Deployment*, *View Deployment Status*; *Run Capability Analysis*, *Generate Nutrition Label*, *Deploy to Sandbox*; *View Nutrition Label*, *Approve or Reject Deployment*; *Open Shared Workbench*, *Request Change via AI*, *Review and Comment on Draft*, *Apply Change to Draft*, *Publish Draft as New Version*; *Share App via Link*, *Set Access Roles*, *View Audit Log*, *Revoke Access*; *Enforce Runtime Egress Allowlist*, *Access External Data via Capability Broker*.

**Relationships, and why each one is the kind it is:**

| Relationship | Type | Justification from the slide's rule |
|---|---|---|
| Submit App → Run Capability Analysis | **«include»** | Analysis is **always** performed on submission. It is behaviour common to more than one use case (submission and republishing), so it is factored out rather than repeated. |
| Run Capability Analysis → Generate Nutrition Label | **«include»** | The label is always produced from the analysis; it is not optional. |
| Deploy to Sandbox → Enforce Egress Allowlist | **«include»** | Every sandboxed deployment enforces the allowlist. Always performed. |
| Deploy to Sandbox → Access External Data via Capability Broker | **«include»** | Whenever external access is part of the deployment, it always goes through the broker. |
| Approve or Reject → Deploy to Sandbox | **«extend»** | Deployment happens **only under a certain condition** — that the approver approved. This is the slide's "optional behaviour required only under certain conditions." |
| Request Change via AI → Apply Change to Draft | **«include»** | Applying the change is an inseparable part of requesting it. |
| Publish Draft → Approve | **«extend»** | Publishing triggers an approval only when an approval policy is in force. |

The **«include» versus «extend»** distinction is the single most likely question on this diagram, so the answer must be crisp: **include = always happens, factored out to avoid repeating shared behaviour, arrow points to the shared (secondary) use case. Extend = happens only under a condition, arrow points back to the primary use case.**

### Likely viva questions

**"Why is Approver a separate actor from Developer?"** Because an actor is a **role**, not a person. The same human being might both write an app and approve it, but the two roles have different goals, different permissions and different use cases. Separating them is what makes the approval control meaningful.

**"Is External Data Source really an actor?"** Yes — the slide's fourth category of actor is **"other system: the other system with which the system must interact."** It is external to Silo, and Silo exchanges information with it, which satisfies the definition.

**"Which are primary and which are secondary actors?"** Developer, Collaborator and Approver are primary — they use the main system functions. Owner/Admin is secondary — administration and maintenance. External Data Source is "other system."

**"Show me an «extend» and explain it."** *Approve or Reject Deployment* extends *Deploy to Sandbox*. Deployment is the base behaviour; it is conditional on the guard "approval granted." Exactly parallel to the slide's Order / Rush Order example, where Rush Order is the special, optional case.

---

## 7.2 Use Case Specifications (the templates)

### The theory behind it

Slide Set 7 gives the **generic format for documenting a use case**: pre-condition, use case name, actors, purpose, overview, type, typical course of events (with AA / SR / SA numbering), exceptional flow, alternate flow, post-condition. Slide Set 5 gives the **ten questions** each scenario must answer. Slide Set 6 adds the note that it is effective to write the description in the **first person**.

### What ours contains

We produced **six** full specifications: **UC-01 Submit App for Deployment, UC-02 Run Capability Analysis and Generate Nutrition Label, UC-03 Approve or Reject Deployment, UC-04 Deploy to Sandbox, UC-05 Request Change via AI in Shared Workbench, UC-06 Share App and Manage Access.**

Each carries: Use Case ID; Use Case Name; Primary Actor; Secondary Actors; Stakeholders and Interests; Description; Trigger; Preconditions; Postconditions on success; Postconditions on failure; a numbered Main Success Scenario; Alternate Flows; Exceptions; Frequency of Use; Special Requirements; Assumptions.

**Worked example — UC-01.** Primary actor: Developer. Trigger: the developer selects "Deploy" and chooses a file. Precondition: authenticated through Google OAuth, and the file is a `.py` or `.zip` within the size limit. Main success scenario, in seven numbered steps: create or select the app → select and submit the file → system validates type and size → system stores and extracts, rejecting any entry whose path escapes the extraction directory → system creates a version with status `analysing` → system spawns a detached build worker and returns 201 → the dashboard begins polling.

**And crucially, the three flows are separated exactly as the slide requires:**

- **Alternate flow** (a different valid path, nothing has gone wrong): *"5a. Application slug already exists for this owner: the system appends a numeric suffix and continues at step 6."*
- **Exceptional flow** (something has gone wrong): *"4a. Archive contains an unsafe path: the system aborts extraction, discards the bundle and records a validation error."* And *"E1. Storage unavailable: the system returns 503 and no version is created."*

### Likely viva questions

**"What is the difference between an alternate flow and an exception?"** An alternate flow is a **valid but different path** — the ATM slide's example is the user changing their mind and pressing cancel. An exception is an **error or abnormal condition** — the machine being out of cash, or money getting stuck. Ours follow the same split: a duplicate slug is an alternate flow because it is normal and handled; an unsafe archive path is an exception because something is wrong.

**"What is a precondition versus a postcondition?"** A precondition is what must be true **before** the use case can start; a postcondition is what is guaranteed to be true **after** it finishes. We specify postconditions for both success and failure, because "what is true after it fails" is just as important — for UC-01 on failure, no version record exists and the uploaded bytes are discarded.

---

## 7.3 Activity Diagram (swimlane)

### The theory behind it

Slide Set 6: an activity diagram **supplements the use case by providing a graphical representation of the flow of interaction within a specific scenario**, using rounded rectangles for actions, arrows for control flow, diamonds for decisions and solid bars for fork and join. Slide Set 7 adds that activity diagrams describe **procedural logic, business process and work flow**, that they are **similar to flowcharts but flowcharts do not support parallel behaviour**, and that **swimlanes** model the flow of control **between objects**, using **vertical columns with the object's name at the top** and each action placed in its object's lane.

### What our diagram shows

We used the **swimlane form**, following the pattern of the slide's student-admission example (*Academic Section / Accounts Section / Hostel Office / Hospital / Department*). Our five lanes are the five participants in a deployment:

**DEVELOPER · PLATFORM API · ANALYSIS ENGINE · APPROVER · SANDBOX RUNTIME**

The flow, read top to bottom:

1. **Developer lane** — a **solid filled circle** (the initial state, unique and with only one outgoing transition) → *Sign in with Google* → *Create app and upload .py or .zip*.
2. Control crosses into the **Platform API lane** — *Store bundle, version = analysing*.
3. Control crosses into the **Analysis Engine lane** — *Run Semgrep rules and AST scan*.
4. A **solid bar (fork)** splits the flow into two concurrent threads: *Infer build plan: entry, deps, port* and *Generate nutrition label*. These are genuinely independent — neither needs the other's result — so they can run at the same time. A second **solid bar (join)** merges them, and the join cannot be crossed until **both** threads have completed.
5. **Approver lane** — *Review nutrition label* → a **decision diamond** *Approve or reject?* with two guarded exits, **[approve]** and **[reject]**.
6. On **[reject]** — *Record rejection and reason* → back to the Developer lane, *Read rejection reason* → a **bullseye (final state)**.
7. On **[approve]** — into the **Sandbox Runtime lane**: *Build image from plan* → *Run in gVisor sandbox, CPU and memory caps* → *Apply egress allowlist, route via capability broker* → a **decision diamond** *Port responds?* with guards **[yes]** and **[no]** → *Mark version live* (green) or *Mark version failed, attach output* (red).
8. The failure path returns to the Developer lane — *Read build logs* → a **final state**. The success path goes through the API lane — *Serve app via /proxy/id* → back to the Developer lane for the collaboration sequence: *opens shared workbench* → *Request change via AI or comment on draft* → API lane *Apply change to draft* → *Publish draft as new version* → API lane *Log event in audit trail* → **final state**. A note records that a published version re-enters the analysis lane as a new version.

### How it maps to the theory, point by point

| Slide requirement | How our diagram satisfies it |
|---|---|
| Rounded rectangle = action | Every action box is a rounded rectangle |
| Diamond = branching decision | *Approve or reject?* and *Port responds?* |
| Solid bar = fork and join of parallel activities | The two black bars in the Analysis Engine lane |
| Initial state is unique, one transition line | One filled circle, one outgoing arrow |
| End state not necessarily unique | We have **three** final states — reject, build-failure, and normal completion — which the slide explicitly permits |
| Transitions must be labelled after a decision | All four post-decision arrows carry guards: `[approve] [reject] [yes] [no]` |
| Exit lines must cover all eventualities | Both decisions are two-way and exhaustive — approve/reject and yes/no leave no uncovered case |
| Swimlanes use vertical columns with the object name at the top | Five vertical columns, names in the header band |
| Each action goes in its object's lane | Every box sits in the lane of the participant that performs it |

The **fork/join** is the answer to "why is this an activity diagram and not a flowchart" — a flowchart cannot express that the build plan and the nutrition label are computed concurrently.

### Likely viva questions

**"Why did you use swimlanes?"** Because the slide says swimlanes model the **procedural flow of control between objects**. Our deployment involves five different participants, and the interesting fact about the process is *where responsibility hands over*. A plain activity diagram would show the steps but hide the handoffs.

**"What is the difference between a fork and a decision?"** A fork splits into threads that **all execute, concurrently**; a decision selects **exactly one** of several paths based on a guard. Our fork runs the build-plan inference and the label generation at the same time; our decision picks approve **or** reject, never both.

**"What does the join guarantee?"** That the exit cannot occur until **all** entry threads have completed. We cannot present the version for approval until both the build plan and the nutrition label exist.

**"Can you have more than one end state?"** Yes — the slide says the end state is **not necessarily unique**, and ours has three.

**"Is this the implemented system?"** No, and this is worth saying without being asked. This diagram shows the **proposed** system. The Semgrep analysis, nutrition label, approval gate, gVisor sandbox, egress allowlist and collaborative workbench are designed but not yet implemented. What is implemented is the upload, the AST-based inference, the Dockerfile generation, the container run, the TCP readiness probe and the proxy.

---

## 7.4 Class Diagram

### The theory behind it

From the class-diagram slide set: class diagrams show **the kinds of objects in a system and the static relationships between them**, comprising classes (with attributes and operations) and relationships (association, aggregation, composition, generalization, dependency). From Slide Set 6: classes are found by **underlining nouns**, must **not have imperative procedural names**, and their operations fall into **four categories**.

### What our diagram shows

**Twelve classes in three groups.**

**Domain classes** (found by the noun-underlining technique, and all "things" or "roles" in the slide's seven-category classification):

- `User` — `+str id`, `+str email`, `+str google_sub`
- `App` — `+str id`, `+str slug`, `+str name`, `+str owner_id`
- `Version` — `+str id`, `+int version_no`, `+str status`, `+int internal_port`
- `BuildLog` — `+str phase`, `+str level`, `+str message`

**Router classes** (stereotyped `«router»`): `AuthRouter` with `+login() +callback() +me()`; `AppsRouter` with `+create_app() +list_apps() +delete_app()`; `VersionsRouter` with `+upload_version() +list_versions() +get_version_logs()`; `ProxyRouter` with `+proxy()`.

**Service classes** (stereotyped `«service»`): `Builder` with `+run_build() +wait_for_port()`; `Packaging` with `+make_plan() +render_dockerfile()`; `Compose` with `+find_compose_file() +up()`; plus the plain data class `BuildPlan` with `+str mode`, `+str entry_file`, `+int port`, `+list packages`, `+start_command()`.

**Relationships:**

- `User "1" ⋄—— "0..*" App : owns` — **composition** (filled diamond). Justified by the slide's own test: a part in a composition **does not exist independently of the whole**. An App with no owner is meaningless in our system, and deleting a user deletes their apps. The multiplicity on the whole end is **1**, as the slide requires.
- `App "1" ⋄—— "0..*" Version : has` — **composition**, same reasoning. A Version cannot exist without its App.
- `Version "1" ⋄—— "0..*" BuildLog : emits` — **composition**. Build logs belong to exactly one version and die with it.
- `AuthRouter ⋯> User`, `AppsRouter ⋯> App`, `VersionsRouter ⋯> Version`, `ProxyRouter ⋯> Version : routes to` — **dependencies** (dashed arrows). Each router *uses* the model class: it takes it as a parameter, returns it, or holds it as a local variable. This is precisely the slide's list of "uses" relationships. And the slide's consequence applies: **if the model changes, the router may have to change too.**
- `VersionsRouter ⋯> Builder : spawns worker`, `Builder ⋯> Packaging : plans`, `Builder ⋯> Compose : multi-container`, `Builder ⋯> BuildLog : writes`, `Packaging ⋯> BuildPlan : creates` — all **dependencies**, for the same reason.

**Multiplicity reading, in the slide's terms:** on `User "1" —— "0..*" App`, one User is connected to zero or more Apps, and each App is connected to exactly one User.

### How it maps to the theory

- **Noun-derived class names** — `User`, `App`, `Version`, `BuildLog` all came from underlining nouns in our requirements text.
- **No imperative procedural names** — we deliberately named the service class `Packaging`, not `Package` or `Build`. Naming it with a verb would have violated the rule.
- **All four operation categories are present** — `create_app()` changes state; `make_plan()` performs a computation; `list_versions()` inquires about state; `wait_for_port()` monitors for a controlling event.
- **Visibility** — every member is marked `+` public, because our API surface is intentionally public; we would use `-` for internals such as `_launch_build()`.
- **Stereotypes** — `«router»` and `«service»` group classes by architectural role.

### Likely viva questions

**"Why composition and not aggregation between App and Version?"** Because of the independence test in the slide: a part in a **composition does not exist independently of the whole**. The slide's own example is that a Department does not exist independently of its Company, but an Employee does. A Version of a deleted App is meaningless, so it is composition. If Versions could be moved between Apps and survive on their own, it would be aggregation.

**"Why are the router-to-model relationships dependencies rather than associations?"** Because an association is a **structural** relationship — the object holds a persistent link and can navigate to the other object. A router does not *hold* a `Version`; it *uses* one transiently as a parameter or return value. That is the slide's definition of dependency, and the slide's consequence applies: change `Version` and the router may need changing.

**"Where is generalization in your diagram?"** There is none, and that is an honest and correct answer. Generalization represents an **"is-a"** relationship, and no class in our design is a specialisation of another. Our four routers look similar but none is a kind of another; they are siblings, not parent and child. Inventing a `BaseRouter` superclass purely to have a triangle on the diagram would be modelling for the sake of the diagram rather than the system.

**"Why is BuildPlan a class rather than just attributes on Packaging?"** Because a build plan is a **thing** in its own right — it has identity, it is produced once and consumed by several later steps, and it can be logged, compared between versions and tested independently. In code it is a dataclass with a computed property `start_command()`, which is an operation in the "performs a computation" category.

---

## 7.5 Sequence Diagram

### The theory behind it

From the UML slide set: the **Sequence diagram** is a **behavioral diagram** showing **dynamic message passing between objects**. From Slide Set 6, sequence diagrams are listed under **behavioural modelling** alongside state diagrams. The distinguishing feature of a sequence diagram is that **time runs downwards**, so the vertical order of the arrows *is* the order of execution.

### What our diagram shows

**Participants across the top**, each with a vertical **lifeline**: the actors **Owner** and **Collaborator** (drawn as stickmen, because they are actors in the use-case sense), and the objects **Silo Web App**, **Control Plane**, **Build & Analysis** and **App Runtime**.

The diagram is divided into **three labelled blocks**, corresponding to three scenarios:

**Block 1 — Publish Application (messages 1–9).** Owner → Web App: *Upload application*. Web App → Control Plane: *Create version*. Control Plane → Build & Analysis: *Build and analyse source*. Build & Analysis sends a **self-message** to itself: *Infer runtime and capabilities* — an important notational point, because a self-call is drawn as an arrow that leaves a lifeline and returns to it, showing that an object is doing internal work rather than talking to anyone. Build & Analysis → App Runtime: *Deploy isolated container*. App Runtime returns *Container ready* as a **dashed** arrow (a return message). Build & Analysis returns *Live URL and capability manifest*; Control Plane returns *Deployment result and nutrition label*; Web App shows the live application to the Owner.

**Block 2 — Share and Collaborate (messages 10–21).** Owner shares with a collaborator; Control Plane creates role-based access and returns a share link; the Collaborator is given access; the Collaborator submits an improved version; a proposed version is created, built, compared for capability changes and deployed as a **preview**; the **capability diff** is returned and shown to the Owner.

**Block 3 — Review and Promote (messages 22–31).** The Owner approves; the version is promoted; the stable URL is switched to the new version; approval is confirmed back down the chain to the Collaborator. Then an **alternative fragment**, drawn as a dashed box labelled **[Owner rejects]**, shows the other path: reject proposal → record rejection → rejection saved → proposal rejected.

**Activation bars** (the narrow rectangles on each lifeline) show when each object is actively doing something, and **solid arrows are calls while dashed arrows are returns.**

### How it maps to the theory

- It is a **behavioural** model showing **dynamic message passing between objects** — the slide's exact definition.
- **Time is the vertical axis.** Message 5 happens after message 4 because it is lower, not because of any other marking.
- The **self-message** *Infer runtime and capabilities* shows internal computation.
- The **[Owner rejects] fragment** is the sequence-diagram way of expressing what the activity diagram expresses with a decision diamond — it is the same branch, drawn in a different formalism.
- The numbering 1–31 gives us a **trace** that can be walked step by step in a demonstration.

### Likely viva questions

**"What does a sequence diagram show that a class diagram cannot?"** **Time.** A class diagram is **static** — it says a `Builder` depends on `Packaging`, always. A sequence diagram is **dynamic** — it says that in *this* scenario, at *this* point, the Control Plane calls Build & Analysis, and only after that does the App Runtime get involved. Structure versus behaviour.

**"What is the difference between the solid and dashed arrows?"** Solid = a **call** (a message being sent); dashed = a **return** (a reply coming back).

**"Why is there a box around the last section?"** It is an **alternative fragment**, guarded by `[Owner rejects]`. It shows a conditional path — the sequence-diagram equivalent of a decision diamond.

**"Which use case does this diagram realise?"** Block 1 realises UC-01 and UC-04, block 2 realises UC-05 and UC-06, and block 3 realises UC-03. This is worth saying because it demonstrates that the diagrams are one connected model rather than seven unrelated pictures.

---

## 7.6 Collaboration (Communication) Diagram

### The theory behind it

From Slide Set 6, the **collaboration diagram** is listed under **class-based modelling**. From the UML slide set, the **Communication diagram** is a **behavioral diagram** showing **dynamic message passing between objects** — *the same definition given for the sequence diagram.*

That identical definition is exactly why the comparison question gets asked, so the difference must be crisp: **a sequence diagram orders messages by position on a vertical time axis; a collaboration diagram orders them by numbering them, and lays the objects out by their structural links instead.** Same information, different emphasis — sequence emphasises **when**, collaboration emphasises **who is connected to whom**.

### What our diagram shows

**Objects,** written in the `name : Class` form that distinguishes an object from a class: `owner : User`, `collaborator : User`, `ui : Web Interface`, `api : Control Plane`, `engine : Build and Analysis Pipeline`, `db : Silo Database`, `runtime : App Container`.

**Links between them,** and along each link the **numbered messages**. The numbering uses **decimal (nested) notation**, which is the feature of this diagram worth explaining:

- `1: uploadApp()` — owner → ui
- `1.1: createVersion()` — ui → api *(a consequence of message 1)*
- `1.2: storeVersion()` — api → db
- `1.3: buildAndAnalyse()` — api → engine
- `1.4: deploy()` — engine → runtime
- `1.5: saveManifest()` — engine → db
- `1.6: returnURLAndLabel()` — api → ui
- `2: shareApp()` → `2.1: createAccessGrant()` → `2.2: savePermission()`
- `3: submitImprovement()` → `3.1: uploadNewVersion()` → `3.2: compareCapabilities()` → `3.3: saveCapabilityDiff()`
- `4: approveVersion()` → `4.1: promoteVersion()` → `4.2: updateApprovedVersion()` → `4.3: switchLiveVersion()`

The top-level numbers 1, 2, 3, 4 are the four things an actor does. Every `N.M` message is a consequence of message `N`. So the numbering itself encodes the call hierarchy — `1.3` happens because `1` happened.

### How it maps to the theory

- It is the **class-based modelling** counterpart to the sequence diagram: the same interactions, arranged around the **object structure** instead of a timeline.
- Objects are named in `instance : Class` form, distinguishing runtime objects from the classes on our class diagram.
- **Sequence is expressed by numbering** rather than by vertical position — the defining notational difference.

### Likely viva questions

**"What is the difference between a sequence diagram and a collaboration diagram?"** They convey **the same information** — both show dynamic message passing between objects — but they emphasise different things. In a sequence diagram **time is the vertical axis**, so it is best for understanding **the order of events** and is easy to read for a long scenario. In a collaboration diagram **objects are placed by their structural links** and ordering is carried by **message numbers**, so it is best for seeing **which objects are connected to which** and how the interaction is distributed over the structure. They are convertible into one another.

**"What does the decimal numbering mean?"** Nesting. `1.3` is the third message sent as a direct consequence of message `1`. The numbering encodes the call tree that the sequence diagram encodes with activation bars.

**"Why do you have two User objects?"** Because `owner : User` and `collaborator : User` are two **instances** of the same class playing different roles in the same interaction. That is the difference between a class diagram (one `User` box) and an object-level diagram (as many instances as the scenario needs).

---

## 7.7 Data Flow Diagram

### The theory behind it

From the process-modelling slide set: a DFD **graphically illustrates the movement of data between external entities and the processes and data stores within a system**, using four symbols — **process (circle), data store (two parallel lines), source/sink (square), data flow (arrow)** — and must obey the rules A to T, including **balancing** across levels of decomposition. From Slide Set 6, this is the **flow-oriented modelling** element, and it belongs to **structured analysis**, which treats **data and the processes that transform it as separate entities**.

### What our diagram shows

**Processes (circles, numbered, with verb-phrase labels as rule C requires):**

1. **Publish Application**
2. **Analyse Capabilities**
3. **Share and Collaborate**
4. **Review and Promote**
5. **Run Application**

**Data stores (noun-phrase labels, as rule G requires):** *Apps and Versions*, *Capability Manifests*, *Capability Manifests and Audit Log*, *Users and Permissions*.

**Sources/sinks (squares, noun phrases, as rule I requires):** *Owner*, *Collaborator*, *Organisation Admin*, *User*, *Owner Decision*, *Owner Review*.

**Data flows (arrows with noun-phrase labels, as rule P requires):** *Upload code*, *Application source*, *Save version*, *Save manifest*, *Capability label*, *Current version*, *Current capabilities*, *Approve or reject*, *Submit improved version*, *Record review event*, *Capability diff*, *Save approved version*, *Audit information*, *Sharing settings*, *View or revoke access*, *Save permissions*, *Provide application access*, *Access permission*, *Approved version*, *Open stable URL*, *Live application*.

### Checking our diagram against the rules

| Rule | Check |
|---|---|
| **A — no process with only outputs (miracle)** | Every process has at least one input. *Publish Application* takes *Upload code*. |
| **B — no process with only inputs (black hole)** | Every process has at least one output. *Run Application* outputs *Live application*. |
| **C — process has a verb phrase label** | *Publish Application*, *Analyse Capabilities*, *Share and Collaborate*, *Review and Promote*, *Run Application* — all verb phrases. |
| **D — no store-to-store movement** | No arrow runs directly between two data stores; every store-to-store movement passes through a process. |
| **E — no source directly to a data store** | *Owner* does not write to *Apps and Versions* directly; it goes through *Publish Application*. |
| **F — no data store directly to a sink** | *Capability Manifests and Audit Log* reaches *Organisation Admin* only via *Audit information* produced in the flow, never as a direct store-to-sink arrow. |
| **G — data store has a noun phrase label** | *Apps and Versions*, *Users and Permissions*, *Capability Manifests* — all noun phrases. |
| **H — no source directly to a sink** | No arrow bypasses the system. |
| **I — source/sink has a noun phrase label** | *Owner*, *Collaborator*, *Organisation Admin*, *User*. |
| **J — one direction per flow** | Every arrow is single-headed. |
| **M — no flow directly back to the same process** | No self-loops. |
| **N — flow to a data store means update** | *Save version*, *Save manifest*, *Save permissions*, *Save approved version* — all updates. |
| **O — flow from a data store means retrieve or use** | *Current version*, *Current capabilities*, *Approved version*, *Access permission* — all retrievals. |
| **P — data flow has a noun phrase label** | All flow labels are noun phrases. |

**Balancing.** Our diagram is a **level-1** DFD. The **context diagram** above it would be a single process, *Silo Platform*, with the external entities Owner, Collaborator, Organisation Admin and User around it. Balancing requires that the inputs and outputs be conserved: the context diagram's inputs (*upload code*, *sharing settings*, *approve or reject*, *open stable URL*) and outputs (*capability label*, *live application*, *audit information*, *application access*) must all appear on the level-1 diagram, and **no new ones may be introduced.** That is rule Q — a composite flow may be split into components, but no new data may be added and all data in the composite must be accounted for.

### Likely viva questions

**"Is this logical or physical?"** **Logical**, and therefore **technology independent**, which is what the slide asks of a DFD of the new system. Notice that nothing on the diagram says PostgreSQL, Docker or FastAPI. The store is called *Apps and Versions*, not *the apps table*. That is deliberate: the logical DFD survives a change of database.

**"What level is it and what would be above and below?"** It is level-1. Above it is the context diagram — one process, the four external entities, the major flows. Below it, each process can be decomposed further: *Analyse Capabilities* would decompose into 2.1 *Parse source into AST*, 2.2 *Run Semgrep rules*, 2.3 *Resolve dependencies*, 2.4 *Render nutrition label*. Continue until each process is primitive enough to describe in a **process specification**, which the slide defines as the description of data-flow processing at the lowest level of refinement.

**"What is a black hole and does your diagram have one?"** A black hole is a process with **only inputs** and no outputs — data goes in and never comes out, which is always a modelling error. Our diagram has none; every process produces at least one output flow.

**"Why do some of your data stores appear more than once?"** *Apps and Versions* appears twice. Rule **T** explicitly permits repeating data stores or sources/sinks **to avoid having data flow lines cross each other**, and rule *Objects always have a unique name* is paired with the note that stores and flows may be repeated to keep the diagram uncluttered. It is the same store, drawn twice.

---

## 7.8 Project Schedule (Gantt chart)

### The theory behind it

The Gantt chart is not from these four slide sets — it belongs to project planning rather than requirements analysis — but it is part of our documentation, so it is worth being able to explain. It supports the **negotiation** task from Slide Set 5, where **rough guesses of development effort are made and used to assess the impact of each requirement on project cost and delivery time.** A Gantt chart is where those effort estimates become a visible schedule.

### What ours shows

**Seven weeks, three people, four tracks.**

- **Person A — Database & Config:** W1 *DB models, config and migrations* (SQLAlchemy, Pydantic, Alembic, .env); W2–W3 *Inference engine and Dockerfile generation* (language, deps, entrypoint, port, Jinja2); W4–W5 *Sandbox, CI/CD and eval suite* (gVisor, GitHub Actions, pytest, 5 test apps).
- **Person B — Backend API & Docker:** W1 *Auth, CRUD and Docker pipeline* (OAuth, app routes, build, run containers); W2–W4 *Reverse proxy and nutrition label API* (subdomain routing, TLS, LLM scoring); W5 *Approval workflow* (approve, reject, rollback, lifecycle).
- **Person C — Frontend:** W1 *Auth UI, dashboard and upload flow* (Next.js, Google sign-in, app cards, upload); W2–W3 *Build log viewer and sharing* (logs, share links, ACLs, collaboration); W4–W5 *Nutrition label viewer and polish*.
- **Convergence — all three:** W6 *End-to-end integration* (all tracks joined: proxy, inference, UI); W7 *Demo, docs and writeup* (live demo, malicious app blocked, report).

Week 1 is marked **DONE**.

### How it maps to the methodology

The three tracks are **parallel** — which is the same idea the activity diagram's fork expresses, applied to people instead of processes. Each person works independently for five weeks, and the **convergence band in W6 is a join**: integration cannot begin until all three tracks have completed. The dependencies are real: Person B cannot build the deployment pipeline until Person A's database models exist in W1, which is why both start in week 1 with the foundational work.

### Likely viva questions

**"How did you divide the work?"** By **subsystem**, not by task type, so that each person owns a vertical slice and can work without blocking the others. The couplings are deliberately pushed to week 1 (models and config) and week 6 (integration).

**"What slipped?"** Honest answer: the security track. gVisor, Semgrep and the egress allowlist were scheduled for W4–W5 and were deprioritised during negotiation in favour of making the core deployment pipeline genuinely robust — because a platform that cannot reliably deploy a real multi-file project has no value regardless of how well sandboxed it is. That is a negotiation outcome, exactly as Slide Set 5 describes it: requirements were **eliminated, combined or modified** so that the project as a whole remained deliverable.

---
---

# PART 8 — RAPID-FIRE REVISION

## 8.1 Definitions you should be able to give instantly

| Term | One-line definition |
|---|---|
| Requirements engineering | The process of establishing the services a customer requires from a system and the constraints under which it operates and is developed |
| User requirement | Natural-language statements plus diagrams of the services the system provides and its operational constraints — written for customers |
| System requirement | A structured document of detailed system services — written as a contract between client and contractor |
| Software specification | A detailed software description serving as a basis for design or implementation — written for developers |
| Functional requirement | A statement of a service the system should provide, how it reacts to particular inputs, and how it behaves in particular situations |
| Non-functional requirement | A constraint on the services or functions offered by the system |
| Domain requirement | A requirement derived from the application domain, reflecting characteristics of that domain; if unsatisfied, the system may be unworkable |
| Goal | A general intention of the user, such as ease of use — not verifiable |
| Verifiable NFR | A statement using a measure that can be objectively tested |
| Complete | The requirements include descriptions of all facilities required |
| Consistent | There are no conflicts or contradictions in the descriptions of the system facilities |
| QFD | A quality management technique that translates the needs of the customer into technical requirements for software |
| Use case | A dialogue between an actor and the system; a sequence of related transactions performed by an actor and the system |
| Actor | Someone or something external that must interact with the system; a role a user plays with respect to the system |
| System boundary | A rectangle separating what is internal from what is external; the external environment is represented only by actors |
| «include» | Common behaviour factored into a separate use case; always performed; arrow towards the secondary use case |
| «extend» | Optional behaviour required only under certain conditions; arrow towards the primary use case |
| Activity diagram | A graphical representation of the flow of interaction within a specific scenario; like a flowchart but supports parallel behaviour |
| Fork | Start of concurrent actions; single entry, multiple exits |
| Join | End of concurrent actions; multiple entry, single exit; exit waits for all threads |
| Swimlane | A vertical column named for an object, containing every action performed by that object |
| Class diagram | A diagram of the kinds of objects in a system and the static relationships between them |
| Association | A structural relationship connecting objects of one class to objects of another, navigable in both directions unless restricted |
| Aggregation | A whole/part association; diamond on the whole end |
| Composition | A whole/part association where the part does not exist independently of the whole; multiplicity on the whole end is always 1 |
| Generalization | An "is-a" inheritance relationship; line with a triangle at the target end |
| Dependency | A uses-relationship; if the supplier changes, the client might have to change |
| DFD | A diagram showing how input is transformed into output as data objects move through a system |
| Data flow / data store | Data in motion / data at rest |
| Balancing | Conserving inputs to and outputs from a process at the next level of decomposition |
| Black hole / miracle | A process with only inputs / a process with only outputs — both errors |
| Sequence diagram | A behavioural diagram of dynamic message passing between objects, ordered by a vertical time axis |
| Collaboration diagram | The same information, laid out by object links, with ordering carried by message numbers |

## 8.2 Lists you may be asked to reproduce

- **7-step requirements gathering:** Inception, Elicitation, Elaboration, Negotiation, Specification, Validation, Requirements Management.
- **QFD's three requirement types:** Normal, Expected, Exciting.
- **QFD's four deployments:** Function deployment, information deployment, task deployment, value analysis.
- **Three NFR classifications:** Product, organisational, external.
- **Four analysis-modelling approaches:** Flow-oriented, scenario-based, class-based, behavioural.
- **Four operation categories:** Change state, perform computation, inquire about state, monitor for a controlling event.
- **Seven class classifications:** External entity, thing, occurrence/event, role, organizational unit, place, structure.
- **Four actor categories:** Primary, secondary, external hardware, other system.
- **Three UML relationship kinds (Fowler slide):** Association, generalization, dependency.
- **Three flows in a use case:** Typical/normal, alternative, exceptional.
- **Three visibility markers:** `+` public, `-` private, `#` protected.
- **Four DFD symbols:** Process (circle), data store (parallel lines), source/sink (square), data flow (arrow).
- **Seven points on the art of negotiation:** not a competition; map out a strategy; listen actively; focus on the other party's interests; don't let it get personal; be creative; be ready to commit.

## 8.3 The "how did you do it in your project" answers, in one place

| If asked about… | Say this |
|---|---|
| Functional requirements | Upload a `.py` or `.zip`, infer the entry point / dependencies / start command / port, build an image, run a container, probe the port, serve through `/proxy/{id}`, expose build logs |
| Non-functional requirements | Inference under 500 ms (measured under 2 ms); a version is *live* only after a successful TCP connection; per-container CPU and memory caps; Docker for interoperability; zero-configuration usability |
| Domain requirements | ASGI apps need a server, not `python file.py`; `127.0.0.1` is unreachable from outside a container; import name ≠ package name; standard-library modules must never be installed |
| A goal turned into a verifiable requirement | "Deployments should be trustworthy" → "a version is live only after a TCP connection to its port succeeds within the readiness timeout" |
| An NFR conflict | Reliability (install the compiler toolchain so every package builds) versus performance (200 MB added to every build). Resolved by making the compiler layer conditional on the resolved dependency list |
| Incompleteness | Our requirements assumed a flat archive and never covered monorepos; this produced a real build failure and was closed by adding recursive, scored application-root selection |
| Ambiguity | "Run the application" meant different things for Flask, FastAPI and Streamlit; resolved by specifying a **start command** rather than an entry file |
| Inception | Identified three stakeholder viewpoints — developer, collaborator, approver — and answered the four inception questions, including the competitor question that produced our differentiator |
| Elicitation / QFD | Normal = upload and get a URL; Expected = privacy, reliability, speed; Exciting = the nutrition label and the AI workbench |
| Elaboration | Six use cases, four domain classes with attributes and relationships, and the `Version` lifecycle as the object whose life we model |
| Negotiation | Ranked the pipeline P0; dropped gVisor and the egress allowlist; reduced the workbench to a prototype; kept the pipeline and the tests |
| Specification | An SRS with states and modes, requirements grouped by capability, external and internal interfaces, internal data, constraints, and the diagrams as its graphical part |
| Validation | A formal technical review applying the slide's question list; "is it testable?" rewrote the readiness requirement; "do any conflict?" caught the 256 MB / 512 MB contradiction |
| Requirements management | Unique IDs, two-way traceability from requirement to module to test, with Git as the change-control mechanism |
| Analysis modelling | Artefacts from all four categories: use cases and a swimlane activity diagram; class and collaboration diagrams; a DFD; a sequence diagram and the version state model |
| Structured vs OO analysis | We used both — the DFD is structured analysis (passive data, transforming processes); the class and collaboration diagrams are object-oriented (classes that own their operations) |

## 8.4 Three things to volunteer before you are asked

1. **Separate what is implemented from what is proposed.** Implemented: Google OAuth, app and version management, zip upload with a path-traversal guard, AST-based inference (application root, entry point, dependencies, port, localhost repair), Dockerfile generation, Docker Compose support, detached build workers, TCP readiness probing, build logs, reverse proxy. Proposed but not yet built: Semgrep capability analysis, the nutrition label, the approval workflow, gVisor, the egress allowlist, the capability broker, the real-time collaborative workbench, the audit log. Saying this yourself is far better than being caught.

2. **Tell the readiness-probe story.** It demonstrates requirements imprecision, a verifiable non-functional requirement, and validation all at once: Docker publishes a port as soon as a container starts, so a crashed application looked healthy; the vague requirement "the app should deploy successfully" was untestable; replacing it with "a TCP connection to the published port must succeed" made it testable and fixed the bug.

3. **Own the scope reduction as a negotiation outcome, not a failure.** Slide Set 5 says requirements are eliminated, combined or modified so that each party achieves some measure of satisfaction. We prioritised, assessed risk, estimated effort, and cut the security track in favour of a deployment pipeline that actually works on real multi-file projects. That is the process working as designed.
