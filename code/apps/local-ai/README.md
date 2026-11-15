# Local AI

Silo's AI features (the Workbench AI collaborator and **Fix with AI** on the
Security track) can run entirely on this computer, with no API key and nothing
sent to the cloud. `server.mjs` serves a GGUF model through the same
OpenAI-style `/v1/chat/completions` API that Silo uses for Gemini, so the rest
of Silo does not know the difference.

| Part | Where it lives | Size |
|---|---|---|
| Server (`server.mjs`) | this folder | 10 KB |
| Runtime ([node-llama-cpp](https://node-llama-cpp.withcat.ai) 3.22.3, llama.cpp with Vulkan) | `D:\silo-ai` | 744 MB |
| Model: Gemma 4 E4B, QAT Q4_0 GGUF | `D:\models\silo\gemma-4-e4b` | 5.2 GB |

Nothing heavy is stored in the repository or on drive C.

## How Silo uses it

`.env` points Silo at the local server:

```
AI_API_URL=http://127.0.0.1:8090/v1/chat/completions
AI_MODEL=gemma-4-e4b
SILO_AI_HOME=D:/silo-ai
SILO_AI_MODEL=D:/models/silo/gemma-4-e4b/gemma-4-E4B_q4_0-it.gguf
SILO_AI_PORT=8090
```

- `scripts/start.py` starts the server with the rest of Silo and waits for the model to load (about 10 s).
- A server on this machine needs no `AI_API_KEY`.
- If `GEMINI_API_KEY` is also set, Gemini is the backup. When the local model is not running, the request goes to Gemini and the proposal says so.
- Requests for code changes send a JSON schema. The server turns it into a grammar, so the model can only reply with a valid patch. For the local model the grammar also requires at least one changed file, because a 4B model sometimes describes a change without writing it.
- The local model reads text only. Images attached to a request go to Gemini only.
- The context window is 16,384 tokens, so Silo sends the local model projects of up to 24,000 characters. A larger project goes straight to Gemini.

## GPU

The server uses Vulkan, which works through the normal graphics driver on NVIDIA, AMD and Intel GPUs. On a laptop with both an integrated and a dedicated GPU, it picks the dedicated one automatically. To choose another, set `GGML_VK_VISIBLE_DEVICES` (0, 1, …) in `.env`. On an RTX 5050 Laptop GPU (8 GB) the model loads in about 10 s, uses about 4.7 GB of video memory, and writes a small patch in 2–15 s.

## Setting it up on another computer

1. Install the runtime into a folder of your choice:

   ```
   mkdir D:\silo-ai
   cd D:\silo-ai
   npm init -y
   npm install node-llama-cpp@3.22.3 --cache D:\silo-ai\.npm-cache
   ```

2. Put a GGUF chat model somewhere, for example Gemma 4 E4B (`gemma-4-E4B_q4_0-it.gguf`) from [Hugging Face](https://huggingface.co/google).
3. Set `SILO_AI_HOME`, `SILO_AI_MODEL`, `AI_API_URL` and `AI_MODEL` in `.env` as above.
4. Run `python scripts/start.py`. To run the server on its own: `node apps/local-ai/server.mjs`, then check `http://127.0.0.1:8090/health`.
