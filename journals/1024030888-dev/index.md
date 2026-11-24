# Dev’s Journal

Roll No. 1024030888
Name: Dev Kapla
Area: Frontend

+  [W1 : Frontend setup and design system](#w1--frontend-setup-and-design-system)
+  [W2 : Home page and Dashboard](#w2--home-page-and-dashboard)
+  [W3 : App Room](#w3--app-room)
+  [W4 : Workbench layout](#w4--workbench-layout)
+  [W5 : Live editing in the browser](#w5--live-editing-in-the-browser)
+  [W6 : Security Track page](#w6--security-track-page)
+  [W7 : Polish and browser tests](#w7--polish-and-browser-tests)

---

## W1 : Frontend setup and design system

### What I built

+  Next.js 14 project with TypeScript and Tailwind CSS.
+  Design tokens in `tailwind.config.ts`: Silo colours, pill buttons,
   fonts.
+  Shared UI pieces: PillButton, Label, StatusDot, Modal, Drawer, Toast.
+  `api.ts` client and `useAuth` hook.

### Key decision

Utility classes instead of separate CSS files, so every page looks
consistent.

### Outcome

A styled base that all later pages are built on.

---

## W2 : Home page and Dashboard

### What I built

+  Landing page with sign-in, and local account sign-in.
+  Dashboard: scrolling banner, hero card for the latest app, app grid
   with search and filters, activity feed.
+  "+ New app" modal: name the app, drop a zip, upload in one step.

### Key decision

Show each app as a preview card, not a row of technical details.

### Outcome

Users can see, search and create their apps.

---

## W3 : App Room

### What I built

+  Full-screen live preview of the running app.
+  Version filmstrip to switch between versions.
+  Build drawer with real logs, polled while a build runs.
+  "Build details" panel: runtime, entry point, port, limits.

### Key decision

The running app is the centre of the page; technical details open only
on request.

### Outcome

Users watch a build finish and use their app straight away.

---

## W4 : Workbench layout

### What I built

+  Tool rail with drawers: Files, Comments, Changes, Timeline.
+  Preview with phone, tablet and desktop sizes.
+  AI and chat panel with the message composer and quick actions.
+  Proposal cards showing the AI's diff with Apply and Reject.

### Key decision

One screen for preview, code, chat and AI, so users never switch pages.

### Outcome

The Workbench layout is complete, ready for live data.

---

## W5 : Live editing in the browser

### What I built

+  CodeMirror editor connected to Yjs (`useCollaboration` hook).
+  Other people's cursors and a presence list.
+  Status pill: Saving, Saved, Offline, "Access changed".
+  Share panel: invite links, roles, remove members, revoke links.
+  `useWorkbench` hook for checkpoints, preview and publish.

### Key decision

Show "Saved" only after the server confirms the edit is stored.

### Outcome

Several people edit the same file at once and see each other live.

---

## W6 : Security Track page

### What I built

+  Interactive build map with React Flow: one node per version, edges
   marked Expanding or Reducing.
+  Inspector panel: nutrition label, changes, findings, dependencies.
+  Finding cards with file, line, CWE, fix and "Fix with AI".
+  Capability matrix and risk-by-build chart.

### Key decision

An interactive graph instead of static cards, so users explore versions
by clicking.

### Outcome

Users see at a glance what each version can do and what changed.

---

## W7 : Polish and browser tests

### What I built

+  Playwright tests for collaboration, editor scrolling and the Security
   Track.
+  Automated evaluation test cases TC-01 to TC-04, with screenshots.
+  Separate build folders for the test and normal copies.
+  Layout and accessibility fixes across pages.

### Key decision

Test with real browsers and separate accounts, not mocks.

### Outcome

All 9 browser tests pass on the finished frontend.
