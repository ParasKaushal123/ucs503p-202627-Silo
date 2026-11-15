// Silo's local AI: serves a GGUF model (Gemma 4 E4B by default) over the same
// OpenAI-style chat-completions API that Silo uses for Gemini, so nothing leaves
// the machine. The runtime (node-llama-cpp) and the model live outside the repo,
// on whichever drive you choose (see apps/local-ai/README.md).
//
//   node apps/local-ai/server.mjs            (scripts/start.py runs this for you)
//
// Settings (environment variables or the repo's .env file):
//   SILO_AI_HOME     folder where node-llama-cpp is installed   default D:/silo-ai
//   SILO_AI_MODEL    path to the .gguf model                    default D:/models/silo/gemma-4-e4b/gemma-4-E4B_q4_0-it.gguf
//   SILO_AI_PORT     port to listen on (localhost only)         default 8090
//   SILO_AI_CONTEXT  context window in tokens                   default 16384
//   SILO_AI_NAME     model name reported to clients             default gemma-4-e4b
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Values from the repo's .env, so one file configures every part of Silo. */
function dotenv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = { ...dotenv(), ...process.env };
const HOME = env.SILO_AI_HOME || "D:/silo-ai";
const MODEL = env.SILO_AI_MODEL || "D:/models/silo/gemma-4-e4b/gemma-4-E4B_q4_0-it.gguf";
const PORT = Number(env.SILO_AI_PORT || 8090);
const CONTEXT = Number(env.SILO_AI_CONTEXT || 16384);
const NAME = env.SILO_AI_NAME || "gemma-4-e4b";
const LIBRARY = path.join(HOME, "node_modules/node-llama-cpp/dist/index.js");

if (!existsSync(LIBRARY)) {
  console.error(`node-llama-cpp is not installed in ${HOME}. See apps/local-ai/README.md.`);
  process.exit(1);
}
if (!existsSync(MODEL)) {
  console.error(`Model file not found: ${MODEL}. Set SILO_AI_MODEL in .env.`);
  process.exit(1);
}

// On laptops with both an integrated and a dedicated GPU, Vulkan would split the
// model across both, which is slow. Pick the dedicated one unless told otherwise.
if (process.argv[2] === "--list-gpus") {
  const { getLlama } = await import(pathToFileURL(LIBRARY).href);
  const llama = await getLlama({ gpu: "vulkan", build: "never" });
  console.log(JSON.stringify(await llama.getGpuDeviceNames()));
  process.exit(0);
}
if (env.GGML_VK_VISIBLE_DEVICES !== undefined) {
  process.env.GGML_VK_VISIBLE_DEVICES = env.GGML_VK_VISIBLE_DEVICES; // set in .env
} else {
  const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--list-gpus"], {
    encoding: "utf8", env: process.env, timeout: 60_000,
  });
  let dedicated = -1;
  try {
    const names = JSON.parse(probe.stdout.trim().split("\n").pop());
    const index = names.findIndex((n) => /nvidia|geforce|rtx|radeon rx|arc a/i.test(n));
    if (names.length > 1) dedicated = index;
  } catch {
    // No Vulkan GPU listed: node-llama-cpp falls back to the CPU.
  }
  if (dedicated >= 0) {
    // The GPU library reads its environment once at startup (Windows' C runtime keeps
    // its own copy), so restart this server with the choice already in place.
    const child = spawn(process.execPath, process.argv.slice(1), {
      stdio: "inherit", env: { ...process.env, GGML_VK_VISIBLE_DEVICES: String(dedicated) },
    });
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill());
    child.on("exit", (code) => process.exit(code ?? 1));
    await new Promise(() => {}); // the child serves; this process only waits for it
  }
}

const { getLlama, LlamaChatSession } = await import(pathToFileURL(LIBRARY).href);
const started = Date.now();
const llama = await getLlama({ gpu: "auto", build: "never" });
const model = await llama.loadModel({ modelPath: MODEL, gpuLayers: "max" });
const context = await model.createContext({ contextSize: { max: CONTEXT } });
// One model, one memory slot, reused by every request in turn (see serial below).
const sequence = context.getSequence();
const devices = (await llama.getGpuDeviceNames()).join(", ") || "CPU";
console.log(
  `Silo local AI: ${NAME} on ${llama.gpu || "cpu"} (${devices}), ` +
  `${context.contextSize} token context, loaded in ${((Date.now() - started) / 1000).toFixed(1)} s`,
);

/** Text of an OpenAI message; images are dropped (this server is text-only). */
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((p) => p?.type === "text").map((p) => p.text).join("\n");
}

/** Gemma 4 may write its reasoning before a "<channel|>" marker; keep only the answer. */
function answerOnly(text) {
  const marker = text.lastIndexOf("<channel|>");
  return (marker >= 0 ? text.slice(marker + "<channel|>".length) : text).trim();
}

// One model, one context: requests take turns.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function complete(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length || messages.at(-1).role !== "user") {
    throw Object.assign(new Error("The last message must come from the user"), { status: 400 });
  }
  const history = messages.slice(0, -1).map((m) =>
    m.role === "assistant"
      ? { type: "model", response: [textOf(m.content)] }
      : { type: m.role === "system" ? "system" : "user", text: textOf(m.content) },
  );
  const schema = body.response_format?.type === "json_schema" ? body.response_format.json_schema?.schema : null;
  const grammar = schema ? await llama.createGrammarForJsonSchema(schema) : undefined;
  await sequence.clearHistory(); // each request starts from a clean slate
  const session = new LlamaChatSession({ contextSequence: sequence, autoDisposeSequence: false });
  try {
    session.setChatHistory(history);
    const raw = await session.prompt(textOf(messages.at(-1).content), {
      grammar,
      temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
      maxTokens: Math.min(Number(body.max_tokens) || 8192, CONTEXT),
      budgets: { thoughtTokens: 0 },
    });
    return answerOnly(raw);
  } finally {
    session.dispose({ disposeSequence: false });
  }
}

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    return send(res, 200, { ok: true, model: NAME, gpu: llama.gpu || "cpu", context: context.contextSize });
  }
  if (req.method === "GET" && url.pathname === "/v1/models") {
    return send(res, 200, { object: "list", data: [{ id: NAME, object: "model", owned_by: "silo-local" }] });
  }
  if (req.method !== "POST" || url.pathname !== "/v1/chat/completions") {
    return send(res, 404, { error: { message: "Not found" } });
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4_000_000) return send(res, 413, { error: { message: "Request too large" } });
  }
  try {
    const body = JSON.parse(raw || "{}");
    const t0 = Date.now();
    const text = await serial(() => complete(body));
    console.log(`answered in ${((Date.now() - t0) / 1000).toFixed(1)} s (${text.length} chars)`);
    send(res, 200, {
      id: `silo-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: NAME,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
    });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    console.error("request failed:", error.message);
    send(res, status, { error: { message: error.message } });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Listening on http://127.0.0.1:${PORT}/v1/chat/completions`));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await llama.dispose().catch(() => undefined);
    process.exit(0);
  });
}
