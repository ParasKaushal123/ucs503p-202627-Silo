/**
 * Evaluation test cases TC-01 to TC-04 (see testing/Silo_Test_Cases.pdf).
 * Each step records what was done, what happened, pass/fail and a screenshot
 * under testing/results/<EVAL_RUN>/<TC>/, so the run is its own evidence.
 *
 *   EVAL_RUN=before-fix pnpm exec playwright test tests/e2e/evaluation.spec.ts
 */
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const API = "http://localhost:8100";
const RUN = process.env.EVAL_RUN || "run";
const OUT = path.resolve("../../testing/results", RUN);
const APPS = path.resolve("../../testing/test-apps");

type Step = { step: number; action: string; expected: string; actual: string; pass: boolean; comment: string; screenshot?: string };

class Recorder {
  steps: Step[] = [];
  dir: string;
  started = new Date().toISOString();
  constructor(public id: string, public name: string) {
    this.dir = path.join(OUT, id);
    fs.mkdirSync(this.dir, { recursive: true });
  }
  async step(page: Page | null, action: string, expected: string,
             check: () => Promise<{ actual: string; pass: boolean; comment?: string }>) {
    const n = this.steps.length + 1;
    let result: { actual: string; pass: boolean; comment?: string };
    try { result = await check(); }
    catch (e) { result = { actual: `Error: ${(e as Error).message.split("\n")[0]}`, pass: false }; }
    const entry: Step = { step: n, action, expected, actual: result.actual, pass: result.pass, comment: result.comment || "" };
    if (page) {
      entry.screenshot = `step-${String(n).padStart(2, "0")}.png`;
      await page.screenshot({ path: path.join(this.dir, entry.screenshot) }).catch(() => { entry.screenshot = undefined; });
    }
    this.steps.push(entry);
    return result.pass;
  }
  save() {
    const pass = this.steps.every((s) => s.pass);
    fs.writeFileSync(path.join(this.dir, "result.json"), JSON.stringify({
      id: this.id, name: this.name, run: RUN, started: this.started, finished: new Date().toISOString(),
      result: pass ? "PASS" : "FAIL", steps: this.steps,
    }, null, 2));
    return pass;
  }
}

/** Waits up to `ms` for `cond`; returns whether it became true. */
async function until(cond: () => Promise<boolean>, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function account(browser: Browser, name: string) {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const r = await context.request.post(`${API}/auth/register`, {
    data: { name, email: `${name.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@silo.test`, password: "Test-password-123!" },
  });
  expect(r.status()).toBe(201);
  return { context, user: await r.json(), page: await context.newPage() };
}

async function upload(context: BrowserContext, appId: string, file: string) {
  const r = await context.request.post(`${API}/apps/${appId}/versions`, {
    multipart: { file: { name: path.basename(file), mimeType: "application/zip", buffer: fs.readFileSync(file) } },
  });
  return { status: r.status(), body: await r.json() };
}

const saved = (p: Page) => p.locator("header").getByText("Saved", { exact: true });
/** The document text, without collaborators' cursor and name widgets. */
const editorText = (p: Page) => p.locator(".cm-content").evaluate((el) =>
  [...el.querySelectorAll(".cm-line")].map((line) => {
    const copy = line.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer").forEach((w) => w.remove());
    return (copy.textContent || "").replace(/​/g, "");
  }).join("\n"));
/** Visible error banners (Next's empty route announcer also has role=alert). */
const banners = async (p: Page) => (await p.getByRole("alert").allInnerTexts()).filter((t) => t.trim()).length;
const count = (text: string, part: string) => text.split(part).length - 1;

test("TC-01 two users type on the same line at once", async ({ browser }) => {
  const rec = new Recorder("TC-01", "Two users type on the same line at once");
  const owner = await account(browser, "Alex");
  const editor = await account(browser, "Morgan");
  const app = await (await owner.context.request.post(`${API}/apps`, { data: { name: "TC-01 counter" } })).json();
  await upload(owner.context, app.id, path.resolve("tests/fixtures/counter.zip"));
  const draft = await (await owner.context.request.post(`${API}/apps/${app.id}/draft`)).json();
  const invite = await (await owner.context.request.post(`${API}/apps/${app.id}/invites`, { data: { role: "editor" } })).json();
  const A = "<!-- Alex edited -->", B = "<!-- Morgan edited -->";

  await rec.step(owner.page, "Owner opens the app's Workbench", "Workbench loads and the status pill shows Saved", async () => {
    await owner.page.goto(`/apps/${app.id}/workbench`);
    const ok = await until(() => saved(owner.page).isVisible(), 25000);
    return { actual: ok ? "Workbench loaded, pill shows Saved" : "Saved pill did not appear", pass: ok };
  });
  await rec.step(editor.page, "Editor opens the invite link and signs in", "Editor lands in the same Workbench with Saved showing", async () => {
    await editor.page.goto(invite.url.replace(/^https?:\/\/[^/]+/, ""));
    const ok = await until(async () => editor.page.url().includes(`/apps/${app.id}/workbench`) && await saved(editor.page).isVisible(), 25000);
    return { actual: ok ? `Joined as editor; URL ${new URL(editor.page.url()).pathname}` : `Stuck at ${editor.page.url()}`, pass: ok };
  });
  await rec.step(editor.page, "Both open Files and select index.html", "The code editor shows index.html for both users", async () => {
    for (const p of [owner.page, editor.page]) { await p.getByTitle("Files", { exact: true }).click(); await p.locator(".cm-content").waitFor(); }
    const [a, b] = [await editorText(owner.page), await editorText(editor.page)];
    return { actual: `Both editors open (${a.split("\n").length} lines each)`, pass: a === b && a.includes("<h1>") };
  });
  await rec.step(editor.page, `Both put the cursor at the end of the same line and type at the same moment (Owner: ${A}, Editor: ${B})`, "Both see Saving, then Saved, with no error", async () => {
    for (const p of [owner.page, editor.page]) { await p.locator(".cm-content").click(); await p.keyboard.press("Control+End"); }
    await Promise.all([owner.page.keyboard.insertText(`\n${A}`), editor.page.keyboard.insertText(`\n${B}`)]);
    const ok = await until(async () => (await saved(owner.page).isVisible()) && (await saved(editor.page).isVisible()), 20000);
    const alert = await banners(owner.page) + await banners(editor.page);
    return { actual: ok ? `Both returned to Saved; ${alert} error banners` : "One user never reached Saved", pass: ok && alert === 0 };
  });
  await rec.step(owner.page, "Compare the text in both editors", "Both texts appear exactly once, in the same order, for both users", async () => {
    const ok = await until(async () => {
      const [a, b] = [await editorText(owner.page), await editorText(editor.page)];
      return a === b && count(a, A) === 1 && count(a, B) === 1;
    }, 10000);
    const a = await editorText(owner.page);
    const order = a.indexOf(A) < a.indexOf(B) ? "Alex's line first" : "Morgan's line first";
    return { actual: ok ? `Identical in both editors; each line once; ${order}` : `Owner sees A×${count(a, A)} B×${count(a, B)}`, pass: ok };
  });
  await rec.step(editor.page, "Editor reloads the page and opens index.html again", "Both texts are still there after the reload", async () => {
    await editor.page.reload();
    await until(() => saved(editor.page).isVisible(), 25000);
    await editor.page.getByTitle("Files", { exact: true }).click();
    await editor.page.locator(".cm-content").waitFor();
    const t = await editorText(editor.page);
    return { actual: `After reload: Alex line ×${count(t, A)}, Morgan line ×${count(t, B)}`, pass: count(t, A) === 1 && count(t, B) === 1 };
  });
  await rec.step(null, "Check post-condition 1 (read the draft from the server)", "The stored draft contains both lines exactly once", async () => {
    const d = await (await owner.context.request.get(`${API}/drafts/${draft.id}`)).json();
    const html = Object.values(d.files as Record<string, { path: string; content: string }>).find((f) => f.path === "index.html")!.content;
    return { actual: `Server draft revision ${d.revision}: Alex ×${count(html, A)}, Morgan ×${count(html, B)}`, pass: count(html, A) === 1 && count(html, B) === 1 };
  });
  const pass = rec.save();
  await owner.context.close(); await editor.context.close();
  expect(pass, "TC-01 steps").toBe(true);
});

test("TC-02 editor removed while still connected", async ({ browser }) => {
  const rec = new Recorder("TC-02", "Editor removed while still connected");
  const owner = await account(browser, "Alex");
  const editor = await account(browser, "Morgan");
  const stranger = await account(browser, "Sam");
  const app = await (await owner.context.request.post(`${API}/apps`, { data: { name: "TC-02 counter" } })).json();
  await upload(owner.context, app.id, path.resolve("tests/fixtures/counter.zip"));
  const draft = await (await owner.context.request.post(`${API}/apps/${app.id}/draft`)).json();
  let link = "";
  const late = "<!-- typed after removal -->";

  await rec.step(editor.page, "Editor joins through an invite link and opens the Workbench", "Editor sees Saved and an editable code editor", async () => {
    await owner.page.goto(`/apps/${app.id}/workbench`);
    await until(() => saved(owner.page).isVisible(), 25000);
    await owner.page.getByRole("button", { name: "Share", exact: true }).click();
    await owner.page.getByRole("button", { name: "Copy invitation link", exact: true }).click();
    link = await owner.page.getByRole("textbox", { name: "Invitation link" }).inputValue();
    await editor.page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    await until(() => saved(editor.page).isVisible(), 25000);
    await editor.page.getByTitle("Files", { exact: true }).click();
    const editable = await editor.page.locator(".cm-content").getAttribute("contenteditable");
    return { actual: `Joined; editor contenteditable=${editable}`, pass: editable === "true" };
  });
  let seconds = 0;
  await rec.step(editor.page, "Owner opens Share and removes the Editor (×)", "Within about 5 seconds the Editor's header shows \"Access changed\"", async () => {
    await owner.page.getByRole("button", { name: `Remove ${editor.user.name}` }).click();
    const t0 = Date.now();
    const ok = await until(() => editor.page.locator("header").getByText(/Access changed/).isVisible(), 15000);
    seconds = (Date.now() - t0) / 1000;
    return { actual: ok ? `"Access changed — reload" after ${seconds.toFixed(1)} s` : "No change shown within 15 s", pass: ok && seconds <= 15, comment: "Target 5 s (the server rechecks every 5 s); limit 15 s" };
  });
  await rec.step(editor.page, `Editor tries to type "${late}" in the open file`, "The editor is read-only and nothing new reaches the server", async () => {
    const editable = await editor.page.locator(".cm-content").getAttribute("contenteditable");
    await editor.page.locator(".cm-content").click().catch(() => undefined);
    await editor.page.keyboard.insertText(late).catch(() => undefined);
    await editor.page.waitForTimeout(2000);
    const d = await (await owner.context.request.get(`${API}/drafts/${draft.id}`)).json();
    const stored = Object.values(d.files as Record<string, { content: string }>).some((f) => f.content.includes(late));
    return { actual: `contenteditable=${editable}; typed text on server: ${stored ? "yes" : "no"}`, pass: editable === "false" && !stored };
  });
  await rec.step(editor.page, "Editor reloads the Workbench", "The Editor is refused: no workspace, and the API answers 404 for the draft", async () => {
    await editor.page.reload();
    await editor.page.waitForTimeout(2500);
    const status = (await editor.context.request.get(`${API}/drafts/${draft.id}`)).status();
    const page = (await editor.page.locator("body").innerText()).slice(0, 120).replace(/\s+/g, " ");
    return { actual: `API GET draft → ${status}; page: "${page}"`, pass: status === 404 && !(await editor.page.locator(".cm-content").count()) };
  });
  await rec.step(owner.page, "Owner clicks \"Revoke invitation links\"", "A confirmation toast appears", async () => {
    await owner.page.getByRole("button", { name: "Revoke invitation links" }).click();
    const ok = await until(() => owner.page.getByText(/Invitation links revoked/).isVisible(), 8000);
    return { actual: ok ? "Toast: Invitation links revoked" : "No confirmation", pass: ok };
  });
  await rec.step(stranger.page, "A new account opens the old invite link", "The page says \"Invitation not found\"", async () => {
    await stranger.page.goto(link.replace(/^https?:\/\/[^/]+/, ""));
    const ok = await until(() => stranger.page.getByText("Invitation not found").isVisible(), 15000);
    return { actual: ok ? "Shown: Invitation not found" : `Page: ${(await stranger.page.locator("body").innerText()).slice(0, 100)}`, pass: ok };
  });
  await rec.step(null, "Check post-condition 1 (members list on the server)", "Only the Owner is a member; the Editor's grant is gone", async () => {
    const members = await (await owner.context.request.get(`${API}/apps/${app.id}/members`)).json();
    return { actual: `Members: ${members.map((m: { name: string; role: string }) => `${m.name} (${m.role})`).join(", ")}`, pass: members.length === 1 && members[0].role === "owner" };
  });
  const pass = rec.save();
  await owner.context.close(); await editor.context.close(); await stranger.context.close();
  expect(pass, "TC-02 steps").toBe(true);
});

type Node = { version_no: number; version_id: string; classification: string; risk: number; counts: Record<string, number>; capability_keys: string[] };

test("TC-03 risky update, then a fix", async ({ browser }) => {
  const rec = new Recorder("TC-03", "Risky update, then a fix");
  const owner = await account(browser, "Alex");
  const p = owner.page;
  const app = await (await owner.context.request.post(`${API}/apps`, { data: { name: "TC-03 Expense notes" } })).json();
  let nodes: Node[] = [];

  await rec.step(null, "Upload v1 (clean), v2 (risky) and v3 (fixed) to the same app", "Three versions are created (v1, v2, v3)", async () => {
    const results = [];
    for (const v of ["v1", "v2", "v3"]) results.push(await upload(owner.context, app.id, path.join(APPS, `tc03-expense-notes-${v}.zip`)));
    return { actual: results.map((r) => `v${r.body.version_no}: HTTP ${r.status}`).join("; "), pass: results.every((r) => r.status === 201) };
  });
  await rec.step(p, "Open the Security track", "Three build nodes; arrows v1→v2 EXPANDING and v2→v3 REDUCING", async () => {
    await p.goto(`/apps/${app.id}/security`);
    await p.locator(".react-flow__node-build").nth(2).waitFor({ timeout: 90000 });
    await p.waitForTimeout(800);
    nodes = (await (await owner.context.request.get(`${API}/apps/${app.id}/security`)).json()).nodes;
    const ok = nodes.map((n) => n.classification).join(",") === "origin,expanding,reducing";
    return { actual: `${nodes.length} nodes; classifications ${nodes.map((n) => n.classification).join(" → ")}`, pass: ok };
  });
  await rec.step(p, "Click the v1 node", "Nutrition label: serves a web interface (Flask), connects to a database (SQLite), 0 findings", async () => {
    await p.locator(".react-flow__node-build").nth(0).click();
    await p.getByRole("heading", { name: "Capability Facts" }).waitFor();
    const label = await p.locator('section[aria-label^="Capability label"]').innerText();
    const ok = label.includes("Serves a web interface") && label.includes("Connects to a database") && nodes[0].risk < 10
      && Object.values(nodes[0].counts).every((c) => c === 0);
    return { actual: `Risk ${nodes[0].risk}; findings ${JSON.stringify(nodes[0].counts)}; capabilities ${nodes[0].capability_keys.join(", ")}`, pass: ok };
  });
  await rec.step(p, "Click the v2 node", "Changes vs v1: Expanding, risk above 60, 10 findings (4 high, 5 medium, 1 low)", async () => {
    await p.locator(".react-flow__node-build").nth(1).click();
    await p.getByRole("tab", { name: "Changes vs v1" }).waitFor();
    const n = nodes[1];
    const ok = n.classification === "expanding" && n.risk > 60 && n.counts.high === 4 && n.counts.medium === 5 && n.counts.low === 1;
    return { actual: `${n.classification}; risk ${nodes[0].risk} → ${n.risk}; high ${n.counts.high}, medium ${n.counts.medium}, low ${n.counts.low}`, pass: ok };
  });
  await rec.step(p, "Open the Findings tab for v2", "Every finding has a file, line, CWE and fix; the secret's value is never shown", async () => {
    await p.getByRole("tab", { name: /Findings \(/ }).click();
    const detail = await (await owner.context.request.get(`${API}/apps/${app.id}/security/${nodes[1].version_id}`)).json();
    const complete = detail.findings.every((f: { file: string; line: number; cwe: string; fix: string }) => f.file && f.line && /^CWE-\d+$/.test(f.cwe) && f.fix);
    const leaked = (await p.locator("body").innerText()).includes("rk_live_51HxQe8Kd92mZ0pLwT4");
    const titles = detail.findings.map((f: { title: string; severity: string }) => `${f.severity}: ${f.title}`);
    return { actual: `${detail.findings.length} findings, all complete: ${complete}; secret shown: ${leaked ? "YES" : "no"}`, pass: complete && !leaked && detail.findings.length === 10, comment: titles.join("; ") };
  });
  await rec.step(p, "Click the v3 node", "Reducing; 0 findings; v2's 10 findings listed as fixed; risk falls by more than 50", async () => {
    await p.locator(".react-flow__node-build").nth(2).click();
    await p.getByRole("tab", { name: "Changes vs v2" }).waitFor();
    const detail = await (await owner.context.request.get(`${API}/apps/${app.id}/security/${nodes[2].version_id}`)).json();
    const n = nodes[2];
    const fixed = detail.diff.findings_fixed.length;
    const ok = n.classification === "reducing" && Object.values(n.counts).every((c) => c === 0) && fixed === 10 && nodes[1].risk - n.risk > 50;
    return { actual: `${n.classification}; risk ${nodes[1].risk} → ${n.risk}; findings ${JSON.stringify(n.counts)}; fixed ${fixed}`, pass: ok };
  });
  await rec.step(p, "Check the capability matrix and risk chart", "The matrix rings access first gained in v2; the chart shows one bar per version", async () => {
    await p.evaluate(() => document.querySelector("main")?.scrollTo(0, 5000));
    await p.waitForTimeout(400);
    const rows = await p.locator("table tbody tr").count();
    const bars = await p.getByRole("button", { name: /^Open v\d$/ }).count();
    return { actual: `${rows} capability rows; ${bars} bars`, pass: rows >= 9 && bars === 3 };
  });
  const pass = rec.save();
  await owner.context.close();
  expect(pass, "TC-03 steps").toBe(true);
});

test("TC-04 shell command hidden behind dynamic imports", async ({ browser }) => {
  const rec = new Recorder("TC-04", "Shell command hidden behind dynamic imports");
  const owner = await account(browser, "Alex");
  const p = owner.page;
  const app = await (await owner.context.request.post(`${API}/apps`, { data: { name: "TC-04 hidden commands" } })).json();
  let v2: Node | undefined;
  let findings: { rule_id: string; severity: string; cwe: string; line: number; title: string }[] = [];
  // Lines of the four hidden calls in tc04-hidden-v2.zip's app.py.
  const hidden = { 42: "importlib + getattr(mod, \"run\")", 43: "__import__(\"os\").system", 44: "sp.Popen (renamed import)" } as Record<number, string>;
  const dynamicImport = 41;

  await rec.step(null, "Upload v1 (clean) and v2 (with the hidden /admin/run route)", "Two versions are created", async () => {
    const a = await upload(owner.context, app.id, path.join(APPS, "tc04-hidden-v1.zip"));
    const b = await upload(owner.context, app.id, path.join(APPS, "tc04-hidden-v2.zip"));
    return { actual: `v1: HTTP ${a.status}; v2: HTTP ${b.status}`, pass: a.status === 201 && b.status === 201 };
  });
  await rec.step(p, "Open the Security track and click the v2 node", "The arrow into v2 is EXPANDING", async () => {
    await p.goto(`/apps/${app.id}/security`);
    await p.locator(".react-flow__node-build").nth(1).waitFor({ timeout: 90000 });
    await p.locator(".react-flow__node-build").nth(1).click();
    await p.getByRole("tab", { name: "Changes vs v1" }).waitFor();
    v2 = (await (await owner.context.request.get(`${API}/apps/${app.id}/security`)).json()).nodes[1];
    const detail = await (await owner.context.request.get(`${API}/apps/${app.id}/security/${v2!.version_id}`)).json();
    findings = detail.findings;
    return { actual: `${v2!.classification}; risk ${v2!.risk}`, pass: v2!.classification === "expanding" };
  });
  await rec.step(p, "Open v2's nutrition label (Label tab)", "\"Runs system commands\" is listed under What it can do", async () => {
    await p.getByRole("tab", { name: "Label", exact: true }).click();
    await p.getByRole("heading", { name: "Capability Facts" }).waitFor();
    const has = v2!.capability_keys.includes("process");
    return { actual: `Capabilities: ${v2!.capability_keys.join(", ")}`, pass: has, comment: has ? "" : "The label says the app cannot run commands" };
  });
  await rec.step(p, "Open the Findings tab and look for each hidden call", "A high CWE-78 finding on each of the three command lines (42, 43, 44)", async () => {
    await p.getByRole("tab", { name: /Findings \(/ }).click();
    const caught = Object.keys(hidden).map(Number).filter((line) => findings.some((f) => f.line === line && f.severity === "high" && f.cwe === "CWE-78"));
    const missed = Object.keys(hidden).map(Number).filter((line) => !caught.includes(line));
    return {
      actual: `Caught ${caught.length} of 3: ${caught.map((l) => hidden[l]).join(", ") || "none"}`,
      pass: missed.length === 0,
      comment: missed.length ? `Missed: ${missed.map((l) => `line ${l} ${hidden[l]}`).join("; ")}` : "",
    };
  });
  await rec.step(p, "Look for the dynamic import on line 41", "importlib.import_module(\"sub\" + \"process\") is flagged as hiding which module it loads", async () => {
    const f = findings.find((x) => x.line === dynamicImport);
    return { actual: f ? `${f.severity}: ${f.title} (${f.rule_id})` : "No finding on line 41", pass: !!f };
  });
  const pass = rec.save();
  await owner.context.close();
  expect(pass, "TC-04 steps").toBe(true);
});
