import json
import threading

import httpx

from config import (
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    OPENROUTER_HTTP_REFERER,
    OPENROUTER_MODEL_ID,
    OPENROUTER_PROVIDER_SORT,
    OPENROUTER_USE_NITRO,
    OPENROUTER_X_TITLE,
)

generate_lock = threading.Lock()


def clean_response(text: str) -> str:
    text = (text or "").strip()

    for marker in ["<turn|>", "<|turn>", "<eos>", "</s>", "<bos>"]:
        text = text.replace(marker, "")

    return text.strip()


def is_response_truncated(text: str, min_length: int = 10) -> bool:
    """Return True if text looks like it ended mid-sentence."""
    t = (text or "").rstrip()
    if len(t) < min_length:
        return False
    return t[-1] not in {".", "!", "?", ":", '"', "'", ")", "]"} and "</tool_call>" not in t


def effective_openrouter_model_id() -> str:
    model_id = (OPENROUTER_MODEL_ID or "").strip()

    if not model_id:
        model_id = "google/gemma-4-26b-a4b-it:nitro"

    variant_suffixes = (
        ":nitro",
        ":floor",
        ":free",
        ":exacto",
        ":extended",
        ":thinking",
        ":online",
    )

    if OPENROUTER_USE_NITRO and not model_id.endswith(variant_suffixes):
        return f"{model_id}:nitro"

    return model_id


def openrouter_provider_options() -> dict | None:
    if not OPENROUTER_PROVIDER_SORT:
        return None

    if OPENROUTER_PROVIDER_SORT not in {"throughput", "latency", "price"}:
        print(
            f"Ignoring invalid OPENROUTER_PROVIDER_SORT={OPENROUTER_PROVIDER_SORT!r}. "
            "Use throughput, latency, or price.",
            flush=True,
        )
        return None

    return {"sort": OPENROUTER_PROVIDER_SORT}


def openrouter_headers() -> dict[str, str]:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("Missing OPENROUTER_API_KEY environment variable.")

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    if OPENROUTER_HTTP_REFERER:
        headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER
    if OPENROUTER_X_TITLE:
        headers["X-Title"] = OPENROUTER_X_TITLE

    return headers


def text_from_message_content(content) -> str:
    """Convert the local Gemma message format into plain OpenRouter chat text."""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []

        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                item_type = item.get("type")
                if item_type in {"text", "input_text"}:
                    parts.append(str(item.get("text", "")))

        return "\n".join(part for part in parts if part).strip()

    if content is None:
        return ""

    return str(content)


def to_openrouter_messages(messages: list[dict]) -> list[dict[str, str]]:
    openrouter_messages: list[dict[str, str]] = []

    for msg in messages:
        role = msg.get("role", "user")
        if role not in {"system", "user", "assistant", "tool"}:
            role = "user"

        content = text_from_message_content(msg.get("content", ""))
        if not content:
            continue

        openrouter_messages.append({"role": role, "content": content})

    return openrouter_messages


def parse_openrouter_delta(obj: dict) -> str:
    choices = obj.get("choices") or []
    if not choices:
        return ""

    delta = choices[0].get("delta") or {}
    content = delta.get("content")

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") in {"text", "output_text"}:
                parts.append(str(item.get("text", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)

    return ""


def stream_text_from_messages(
    messages: list[dict],
    max_new_tokens: int = 220,
    stop_event: threading.Event | None = None,
):
    payload = {
        "model": effective_openrouter_model_id(),
        "messages": to_openrouter_messages(messages),
        "stream": True,
        "max_tokens": max_new_tokens,
        "temperature": 0.8,
        "top_p": 0.95,
    }

    provider_options = openrouter_provider_options()
    if provider_options is not None:
        payload["provider"] = provider_options

    timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=15.0)
    url = f"{OPENROUTER_BASE_URL}/chat/completions"

    with httpx.Client(timeout=timeout) as client:
        with client.stream(
            "POST",
            url,
            headers=openrouter_headers(),
            json=payload,
        ) as response:
            if response.status_code >= 400:
                error_body = response.read().decode("utf-8", errors="ignore")[-2000:]
                raise RuntimeError(
                    f"OpenRouter request failed with status {response.status_code}: {error_body}"
                )

            for line in response.iter_lines():
                if stop_event is not None and stop_event.is_set():
                    break

                line = (line or "").strip()
                if not line or line.startswith(":"):
                    continue

                if not line.startswith("data:"):
                    continue

                data = line.removeprefix("data:").strip()
                if data == "[DONE]":
                    break

                try:
                    obj = json.loads(data)
                except json.JSONDecodeError:
                    continue

                if obj.get("error"):
                    raise RuntimeError(json.dumps(obj["error"], ensure_ascii=False))

                delta = parse_openrouter_delta(obj)
                if delta:
                    yield delta
