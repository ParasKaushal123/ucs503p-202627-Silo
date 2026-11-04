"""Gemini through its OpenAI-compatible endpoint, faked with httpx.MockTransport."""

import json

import httpx
import pytest

from silo_api import config
from silo_api.config import GEMINI_CHAT_URL, GEMINI_DEFAULT_MODEL, ai_provider, settings
from silo_api.routes import proposals
from tests.conftest import TestSession


@pytest.fixture
def gemini(monkeypatch):
    """Only GEMINI_API_KEY set; record every request the API makes."""
    for name in ("ai_api_url", "ai_api_key", "ai_model", "ai_reasoning_effort"):
        monkeypatch.setattr(settings, name, "")
    monkeypatch.setattr(settings, "gemini_api_key", "test-gemini-key")
    monkeypatch.setattr(proposals, "SessionLocal", TestSession)

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(proposals.asyncio, "sleep", no_wait)
    calls, replies = [], []

    def handler(request: httpx.Request):
        calls.append(
            {
                "url": str(request.url),
                "headers": request.headers,
                "body": json.loads(request.content),
            }
        )
        answer = replies.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    monkeypatch.setattr(proposals, "TRANSPORT", httpx.MockTransport(handler))
    return calls, replies


def reply(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def patch_json(heading="Hello from Gemini"):
    return json.dumps(
        {
            "summary": "Change the heading",
            "changes": [{"path": "README.md", "content": f"# {heading}\n", "delete": False}],
        }
    )


@pytest.fixture
def draft(client, auth_cookies):
    app = client.post("/apps", json={"name": "Gemini app"}, **auth_cookies).json()
    return client.post(f"/apps/{app['id']}/draft", **auth_cookies).json()


def ask(client, auth_cookies, draft, prompt="Change the heading"):
    response = client.post(
        f"/drafts/{draft['id']}/proposals",
        json={"prompt": prompt, "expected_hash": draft["source_hash"]},
        **auth_cookies,
    )
    assert response.status_code == 201
    # TestClient runs the background generation before returning.
    return client.get(f"/proposals/{response.json()['id']}", **auth_cookies).json()


def test_gemini_key_alone_configures_endpoint_and_model(client, auth_cookies, gemini):
    provider = ai_provider()
    assert provider["url"] == GEMINI_CHAT_URL and provider["model"] == GEMINI_DEFAULT_MODEL
    assert provider["reasoning_effort"] == "low"
    shown = client.get("/ai/config", **auth_cookies).json()
    assert shown == {"enabled": True, "model": GEMINI_DEFAULT_MODEL, "provider": "Gemini"}
    assert "test-gemini-key" not in json.dumps(shown)


def test_other_provider_needs_its_own_key(monkeypatch, gemini):
    """The Gemini key is never sent to another provider; Gemini stays as the backup."""
    monkeypatch.setattr(settings, "ai_api_url", "https://other.example/v1/chat/completions")
    monkeypatch.setattr(settings, "ai_model", "other-model")
    assert [p["url"] for p in config.ai_providers()] == [GEMINI_CHAT_URL]
    monkeypatch.setattr(settings, "ai_api_key", "other-key")
    first, backup = config.ai_providers()
    assert first["key"] == "other-key" and first["gemini"] is False
    assert first["reasoning_effort"] == "" and first["local"] is False
    assert backup["url"] == GEMINI_CHAT_URL and backup["key"] == "test-gemini-key"


LOCAL_URL = "http://127.0.0.1:8090/v1/chat/completions"


@pytest.fixture
def local_ai(monkeypatch, gemini):
    """The local model (apps/local-ai) as the main provider, Gemini as the backup."""
    monkeypatch.setattr(settings, "ai_api_url", LOCAL_URL)
    monkeypatch.setattr(settings, "ai_model", "gemma-4-e4b")
    return gemini


def test_local_model_is_tried_first_without_a_key(client, auth_cookies, draft, local_ai):
    calls, replies = local_ai
    shown = client.get("/ai/config", **auth_cookies).json()
    assert shown == {"enabled": True, "model": "gemma-4-e4b", "provider": "Local AI"}
    replies.append(reply(patch_json("Hello from Gemma")))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "ready" and proposal["summary"] == "Change the heading"
    assert len(calls) == 1 and calls[0]["url"] == LOCAL_URL
    assert calls[0]["headers"]["authorization"] == "Bearer local"
    assert calls[0]["body"]["model"] == "gemma-4-e4b"
    assert "reasoning_effort" not in calls[0]["body"]


def test_local_model_not_running_falls_back_to_gemini(client, auth_cookies, draft, local_ai):
    calls, replies = local_ai
    replies.extend([httpx.ConnectError("refused"), reply(patch_json())])
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "ready"
    assert "gemma-4-e4b was not running" in proposal["summary"]
    assert [c["url"] for c in calls] == [LOCAL_URL, GEMINI_CHAT_URL]


def test_local_model_alone_not_running_says_how_to_start_it(
    client, auth_cookies, draft, local_ai, monkeypatch
):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    _, replies = local_ai
    replies.append(httpx.ConnectError("refused"))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "failed"
    assert "127.0.0.1:8090" in proposal["error"] and "scripts/start.py" in proposal["error"]


def test_gemini_reply_becomes_reviewable_proposal(client, auth_cookies, draft, gemini):
    calls, replies = gemini
    replies.append(reply(patch_json()))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "ready" and proposal["summary"] == "Change the heading"
    assert "+# Hello from Gemini" in proposal["diffs"][0]["diff"]
    sent = calls[0]
    assert sent["url"] == GEMINI_CHAT_URL
    assert sent["headers"]["authorization"] == "Bearer test-gemini-key"
    assert sent["body"]["model"] == GEMINI_DEFAULT_MODEL
    assert sent["body"]["response_format"]["type"] == "json_schema"
    assert sent["body"]["reasoning_effort"] == "low"


def test_fenced_reply_with_prose_still_parses(client, auth_cookies, draft, gemini):
    _, replies = gemini
    replies.append(reply("Here is the change:\n```json\n" + patch_json() + "\n```"))
    assert ask(client, auth_cookies, draft)["status"] == "ready"


def test_rate_limit_is_retried(client, auth_cookies, draft, gemini):
    calls, replies = gemini
    replies.extend([httpx.Response(429, headers={"retry-after": "1"}), reply(patch_json())])
    assert ask(client, auth_cookies, draft)["status"] == "ready"
    assert len(calls) == 2


def test_busy_model_falls_back_to_lighter_gemini(client, auth_cookies, draft, gemini):
    calls, replies = gemini
    busy = httpx.Response(503, json={"error": {"message": "Model is under high demand"}})
    limited = httpx.Response(429, json={"error": {"message": "Quota exceeded"}})
    replies.extend([busy, limited, reply(patch_json())])
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "ready"
    fallbacks = ai_provider()["fallbacks"]
    # A busy model is skipped straight away, not retried.
    assert [c["body"]["model"] for c in calls] == [GEMINI_DEFAULT_MODEL, *fallbacks[:2]]
    assert f"via {fallbacks[1]}" in proposal["summary"]


def test_every_model_busy_gives_a_clear_message(client, auth_cookies, draft, gemini):
    calls, replies = gemini
    models = 1 + len(ai_provider()["fallbacks"])
    busy = {"error": {"message": "busy"}}
    replies.extend(httpx.Response(503, json=busy) for _ in range(2 * models))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "failed"
    assert "Every Gemini model is busy" in proposal["error"]
    assert len(calls) == 2 * models  # the whole list, twice


def test_bad_key_shows_googles_message(client, auth_cookies, draft, gemini):
    _, replies = gemini
    invalid = "API key not valid. Please pass a valid API key."
    replies.append(httpx.Response(400, json=[{"error": {"code": 400, "message": invalid}}]))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "failed"
    assert "API key not valid" in proposal["error"]
    assert "test-gemini-key" not in proposal["error"]


def test_provider_without_structured_output_is_retried_plain(client, auth_cookies, draft, gemini):
    calls, replies = gemini
    replies.extend(
        [
            httpx.Response(400, json={"error": {"message": "Unknown field response_format"}}),
            reply(patch_json()),
        ]
    )
    assert ask(client, auth_cookies, draft)["status"] == "ready"
    assert "response_format" in calls[0]["body"] and "response_format" not in calls[1]["body"]


def test_patch_touching_env_file_is_refused(client, auth_cookies, draft, gemini):
    _, replies = gemini
    replies.append(
        reply(
            json.dumps(
                {
                    "summary": "Leak",
                    "changes": [{"path": ".env", "content": "KEY=1", "delete": False}],
                }
            )
        )
    )
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "failed" and "protected" in proposal["error"]


def test_unconfigured_ai_is_reported(client, auth_cookies, draft, monkeypatch):
    for name in ("ai_api_url", "ai_api_key", "ai_model", "gemini_api_key"):
        monkeypatch.setattr(settings, name, "")
    response = client.post(
        f"/drafts/{draft['id']}/proposals",
        json={"prompt": "Anything", "expected_hash": draft["source_hash"]},
        **auth_cookies,
    )
    assert response.status_code == 503 and "GEMINI_API_KEY" in response.json()["detail"]


def test_local_model_must_write_at_least_one_file(client, auth_cookies, draft, local_ai):
    calls, replies = local_ai
    replies.append(reply(patch_json()))
    ask(client, auth_cookies, draft)
    changes = calls[0]["body"]["response_format"]["json_schema"]["schema"]["properties"]["changes"]
    assert changes["minItems"] == 1
    # Cloud providers get the schema without it.
    cloud = proposals.PATCH_SCHEMA["json_schema"]["schema"]["properties"]["changes"]
    assert "minItems" not in cloud


def test_reply_without_changes_is_not_shown_as_ready(client, auth_cookies, draft, gemini):
    _, replies = gemini
    replies.append(reply(json.dumps({"summary": "Updated the heading", "changes": []})))
    proposal = ask(client, auth_cookies, draft)
    assert proposal["status"] == "failed"
    assert "did not change any files" in proposal["error"]
