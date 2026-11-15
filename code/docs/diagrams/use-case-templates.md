# Use Case Specifications — Silo

Six use cases are specified below in the standard (Cockburn-style) template. Use case identifiers correspond to the use case diagram.

---

## UC-01: Submit App for Deployment

| Field | Description |
|---|---|
| **Use Case ID** | UC-01 |
| **Use Case Name** | Submit App for Deployment |
| **Primary Actor** | Developer |
| **Secondary Actors** | Build Engine |
| **Stakeholders and Interests** | Developer wants the application running without writing configuration. Owner wants every upload recorded against an identity. |
| **Description** | The developer uploads a Python application, as a single file or a ZIP archive, and the platform accepts it, stores it as a new version, and begins the deployment pipeline. |
| **Trigger** | Developer selects "Deploy" and chooses a file in the dashboard. |
| **Preconditions** | Developer is authenticated through Google OAuth. The upload is a `.py` file or a `.zip` archive within the configured size limit. |
| **Postconditions (Success)** | A new version record exists with status `analysing`, the bundle is extracted to isolated storage, and a build worker has been started. |
| **Postconditions (Failure)** | No version record is created, the uploaded bytes are discarded, and the developer sees the reason for rejection. |

**Main Success Scenario**

1. Developer opens the dashboard and creates an application, or selects an existing one.
2. Developer selects a `.py` file or `.zip` archive and submits it.
3. System validates the file type and size.
4. System stores the bundle and extracts the archive, rejecting any entry whose path escapes the extraction directory.
5. System creates a version record with status `analysing` and increments the version number.
6. System spawns a detached build worker and returns `201 Created`.
7. Dashboard begins polling the version status.

**Alternate Flows**

- **3a. File type not supported:** System rejects the upload and displays the accepted formats. Use case ends.
- **4a. Archive contains an unsafe path:** System aborts extraction, discards the bundle, and records a validation error. Use case ends.
- **5a. Application slug already exists for this owner:** System appends a numeric suffix and continues at step 6.

**Exceptions**

- **E1. Storage unavailable:** System returns `503`, no version is created, and the developer is asked to retry.

| **Frequency of Use** | Several times per application per day during active development. |
|---|---|
| **Special Requirements** | Upload must not block the request thread; the build runs asynchronously. |
| **Assumptions** | The application is written in Python and is intended to serve HTTP. |

---

## UC-02: Run Capability Analysis and Generate Nutrition Label

| Field | Description |
|---|---|
| **Use Case ID** | UC-02 |
| **Use Case Name** | Run Capability Analysis and Generate Nutrition Label |
| **Primary Actor** | Build Engine (system-initiated) |
| **Secondary Actors** | Developer, Approver |
| **Stakeholders and Interests** | Approver needs a readable summary of what the code can do. Developer needs the summary to be accurate and fast. |
| **Description** | Before anything is executed, the system scans the submitted source statically and produces a nutrition label describing the capabilities the application exercises. |
| **Trigger** | A version reaches status `analysing` (from UC-01 or UC-05). |
| **Preconditions** | An extracted bundle exists for the version. |
| **Postconditions (Success)** | A nutrition label is stored against the version, listing filesystem access, network destinations, subprocess execution, and credential usage, and the version advances to `awaiting approval` or `building`. |
| **Postconditions (Failure)** | Version status is set to `failed` with the analyser output attached; no container is started. |

**Main Success Scenario**

1. System walks the extracted bundle and selects the application root.
2. System parses each Python module into an abstract syntax tree.
3. System runs the Semgrep rule set for filesystem writes, outbound network calls, subprocess and `eval` usage, and hardcoded credentials.
4. System merges the AST findings and Semgrep findings into a capability set.
5. System infers the build plan in parallel: entry point, dependencies, run mode, and listening port.
6. System renders the capability set as a nutrition label in plain language.
7. System stores the label and advances the version.

**Alternate Flows**

- **3a. A module fails to parse:** System records the file as unanalysable, marks the label incomplete, and continues with the remaining modules.
- **5a. No entry point can be determined:** System records a diagnostic naming the files it considered and sets the version to `failed`.
- **5b. An import cannot be mapped to a package:** System records the unresolved import as a diagnostic rather than guessing a package name.

**Exceptions**

- **E1. Analysis exceeds the time budget:** System aborts the scan, marks the version `failed`, and attaches the partial output.

| **Frequency of Use** | Once per version, including every republished draft. |
|---|---|
| **Special Requirements** | Analysis is static only; no submitted code is executed during this use case. |
| **Assumptions** | The Semgrep rule set is maintained alongside the platform. |

---

## UC-03: Approve or Reject Deployment

| Field | Description |
|---|---|
| **Use Case ID** | UC-03 |
| **Use Case Name** | Approve or Reject Deployment |
| **Primary Actor** | Approver |
| **Secondary Actors** | Developer |
| **Stakeholders and Interests** | Approver, typically non-technical, must decide on risk without reading code. Developer needs a clear reason when work is rejected. |
| **Description** | An approver reviews the nutrition label for a pending version and either releases it to the sandbox or rejects it with a recorded reason. |
| **Trigger** | A version enters status `awaiting approval`. |
| **Preconditions** | The version has a completed nutrition label. The actor holds the approver role on the application. |
| **Postconditions (Success)** | The version is recorded as approved and released to deployment, or recorded as rejected with a reason; the decision is written to the audit log. |
| **Postconditions (Failure)** | The version remains in `awaiting approval` and no deployment occurs. |

**Main Success Scenario**

1. Approver opens the pending version from the review queue.
2. System displays the nutrition label and any diagnostics from UC-02.
3. Approver compares the declared capabilities against what the application is supposed to do.
4. Approver selects "Approve".
5. System records the approver identity, timestamp and decision, sets `approved_version_id`, and triggers UC-04.

**Alternate Flows**

- **4a. Approver selects "Reject":** System requires a reason, records the rejection, notifies the developer, and returns the version to the shared workbench (UC-05). Use case ends.
- **4b. Approver requests a change instead of deciding:** System records a comment on the draft and leaves the version pending.
- **2a. The label is marked incomplete:** System shows a warning that some modules could not be analysed; the approver may still decide.

**Exceptions**

- **E1. Approval policy is disabled for this workspace:** UC-03 is skipped and the version proceeds directly to UC-04.

| **Frequency of Use** | Once per version where an approval policy applies. |
|---|---|
| **Special Requirements** | Every decision is immutable and attributable. |
| **Assumptions** | The approver is a different person from the submitting developer. |

---

## UC-04: Deploy to Sandbox

| Field | Description |
|---|---|
| **Use Case ID** | UC-04 |
| **Use Case Name** | Deploy to Sandbox |
| **Primary Actor** | Build Engine (system-initiated) |
| **Secondary Actors** | Developer, Capability Broker, External Data Source |
| **Stakeholders and Interests** | Developer wants a working URL. Owner wants the code contained and its outbound traffic restricted. |
| **Description** | The system builds a container image from the inferred plan and runs it inside a gVisor sandbox with resource caps and a network egress allowlist, then verifies that the application is actually serving. |
| **Trigger** | A version is approved, or approval is not required. |
| **Preconditions** | A valid build plan exists. The container runtime is reachable. |
| **Postconditions (Success)** | The version status is `live`, an internal port is recorded, and requests to `/proxy/{id}` reach the running application. |
| **Postconditions (Failure)** | The version status is `failed`, the build output is attached, and any partial container is removed. |

**Main Success Scenario**

1. System checks the bundle for a Compose file.
2. If none is present, system generates a Dockerfile from the build plan and rewrites any local-only host binding to `0.0.0.0` in the build copy.
3. System builds the image, streaming output to the build log.
4. System starts the container in a gVisor sandbox with CPU and memory limits applied.
5. System applies the egress allowlist and routes any declared external access through the capability broker.
6. System probes the published port by opening a TCP connection until it succeeds or the readiness timeout expires.
7. System records the internal port and sets the version to `live`.

**Alternate Flows**

- **1a. A Compose file is present:** System rewrites host ports to ephemeral ports, removes fixed container names, brings the project up, and continues at step 6.
- **2a. The bundle contains its own Dockerfile:** System uses it instead of generating one.
- **6a. Port does not respond before the timeout:** System sets the version to `failed`, captures container logs, and stops the container. Use case ends.

**Exceptions**

- **E1. Image build fails:** System sets the version to `failed` and attaches the build output.
- **E2. Build worker dies mid-run:** On restart, the system detects the stale lock file and marks the interrupted version `failed`.

| **Frequency of Use** | Once per approved version. |
|---|---|
| **Special Requirements** | A published host port alone must never be treated as evidence of readiness. |
| **Assumptions** | The container runtime supports the gVisor runtime class. |

---

## UC-05: Request Change via AI in Shared Workbench

| Field | Description |
|---|---|
| **Use Case ID** | UC-05 |
| **Use Case Name** | Request Change via AI in Shared Workbench |
| **Primary Actor** | Collaborator |
| **Secondary Actors** | Developer, Approver, Build Engine |
| **Stakeholders and Interests** | Collaborator wants to change behaviour without writing code. Developer wants changes isolated from the live version until published. |
| **Description** | A collaborator opens the shared workbench for a running application, describes a change in natural language, and the system applies it to a draft that can be reviewed and published as a new version. |
| **Trigger** | Collaborator opens the workbench and submits a change request or a comment. |
| **Preconditions** | The application has at least one version. The actor holds the editor or commenter role. |
| **Postconditions (Success)** | A draft exists containing the change, visible to all collaborators, with the live version unaffected. |
| **Postconditions (Failure)** | The draft is unchanged and the collaborator is shown what could not be applied. |

**Main Success Scenario**

1. Collaborator opens the shared workbench for the application.
2. System loads the current draft and shows the change history.
3. Collaborator describes the required change in natural language.
4. System generates a code change and shows the difference against the draft.
5. Collaborator reviews the difference and applies it.
6. System saves the draft and broadcasts the update to other collaborators in the session.
7. Collaborator selects "Publish as new version", which creates a version and re-enters UC-02.

**Alternate Flows**

- **3a. Collaborator only comments:** System attaches the comment to the relevant part of the draft and notifies the other participants. Use case ends.
- **5a. Collaborator discards the change:** System leaves the draft as it was.
- **7a. Collaborator does not publish:** The draft persists for later editing; no version is created.

**Exceptions**

- **E1. The change cannot be applied cleanly:** System reports the conflict and leaves the draft unmodified.
- **E2. Two collaborators edit simultaneously:** System applies the changes in order received and shows the resulting draft to both.

| **Frequency of Use** | Continuous during collaborative editing sessions. |
|---|---|
| **Special Requirements** | A draft is never served to end users until published and, where required, approved. |
| **Assumptions** | Collaborators are invited by the owner and hold explicit roles. |

---

## UC-06: Share App and Manage Access

| Field | Description |
|---|---|
| **Use Case ID** | UC-06 |
| **Use Case Name** | Share App and Manage Access |
| **Primary Actor** | Owner / Admin |
| **Secondary Actors** | Developer, Collaborator, Approver |
| **Stakeholders and Interests** | Owner must control who can view, edit, approve, or revoke. Collaborators need access without a platform account being set up manually. |
| **Description** | The owner shares a deployed application by link, assigns roles to participants, reviews the audit log, and revokes access when it is no longer required. |
| **Trigger** | Owner opens the sharing panel for an application. |
| **Preconditions** | The actor is the owner of the application or holds the admin role. |
| **Postconditions (Success)** | Access rules reflect the owner's changes immediately, and each change is recorded in the audit log. |
| **Postconditions (Failure)** | Existing access rules remain unchanged. |

**Main Success Scenario**

1. Owner opens the sharing panel for the application.
2. System displays the current participants, their roles, and the active share link.
3. Owner generates or copies a share link, or adds a participant by email address.
4. Owner assigns a role: viewer, commenter, editor, or approver.
5. System stores the role, writes an audit entry, and applies the rule to subsequent requests.

**Alternate Flows**

- **3a. Owner revokes the share link:** System invalidates the link; requests using it receive `403`. Use case ends.
- **4a. Owner changes an existing participant's role:** System replaces the role and records both the previous and the new value.
- **2a. Owner opens the audit log:** System lists uploads, approvals, rejections, publishes, and access changes with actor and timestamp.

**Exceptions**

- **E1. Owner attempts to remove their own ownership:** System refuses unless another owner exists.

| **Frequency of Use** | Occasional; at project setup and when team membership changes. |
|---|---|
| **Special Requirements** | Revocation takes effect on the next request, not at session expiry. |
| **Assumptions** | Identity is established through Google OAuth for every participant. |
