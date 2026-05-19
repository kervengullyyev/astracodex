import json
import re

SENTENCE_END_RE = re.compile(r'(?<=[.!?])(?=\s|$|<tool_call>)')
TOOL_OPEN_TAG = "<tool_call>"
TOOL_CLOSE_TAG = "</tool_call>"


def ndjson(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False) + "\n"


def split_completed_dot_sentences(buffer: str):
    completed = []

    while "." in buffer:
        dot_index = buffer.find(".")
        sentence = buffer[:dot_index + 1].strip()
        buffer = buffer[dot_index + 1:]

        if sentence:
            completed.append(sentence)

    return completed, buffer


def extract_tool_events(text: str) -> tuple[str, list]:
    """Strip complete <tool_call>...</tool_call> blocks from text."""
    tool_events = []

    while True:
        start = text.find(TOOL_OPEN_TAG)
        if start == -1:
            break
        end = text.find(TOOL_CLOSE_TAG, start)
        if end == -1:
            break
        end += len(TOOL_CLOSE_TAG)
        full_tag = text[start:end]

        try:
            tool_json_str = full_tag.replace("<tool_call>", "").replace("</tool_call>", "").strip()
            print(f"Processing tool call: {tool_json_str}", flush=True)
            tool_data = json.loads(tool_json_str)
            name = tool_data.get("name", "")
            args = tool_data.get("arguments", {})

            if name == "highlight_component":
                x = args.get("x")
                y = args.get("y")
                if x is not None and y is not None:
                    tool_events.append(ndjson({
                        "type": "highlight",
                        "x": x,
                        "y": y,
                        "label": args.get("label", ""),
                    }))
                else:
                    print(f"Skipping highlight due to missing coordinates: x={x}, y={y}", flush=True)
            elif name in ("show_component", "click_component"):
                tool_events.append(ndjson({
                    "type": name,
                    "id": args.get("id"),
                }))
            elif name in ("set_slider", "set_slider_value", "control_slider"):
                slider_id = args.get("id")
                value = args.get("value", args.get("targetValue", args.get("target_value")))
                if slider_id is not None and value is not None:
                    tool_events.append(ndjson({
                        "type": "set_slider",
                        "id": slider_id,
                        "value": value,
                        "interactionType": args.get("interactionType") or args.get("interactiontype"),
                        "name": args.get("name"),
                    }))
                else:
                    print(f"Skipping slider tool due to missing id/value: id={slider_id}, value={value}", flush=True)
            elif name == "change_section":
                tool_events.append(ndjson({
                    "type": "lesson_started",
                    "section": f"Section-{args.get('section')}",
                }))
        except Exception as exc:
            print("Tool call parse error:", exc, flush=True)

        text = text[:start] + text[end:]
        if start < len(text) and text[start] == "\n":
            text = text[:start] + " " + text[start + 1:]

    return text, tool_events


def _append_sentence_event(events: list[tuple[str, str]], raw_segment: str) -> None:
    spoken = raw_segment.strip()
    if len(spoken) > 2:
        events.append(("SENTENCE", spoken))


def _append_tool_events(events: list[tuple[str, str]], raw_tool_tag: str) -> None:
    _, tool_events = extract_tool_events(raw_tool_tag)
    for tool_event in tool_events:
        events.append(("TOOL", tool_event))


def _sentence_segment_end(buffer: str, match: re.Match) -> int:
    end = match.start()
    if end < len(buffer) and buffer[end].isspace():
        return end + 1
    return end


def tokenize_buffer(tts_buffer: str) -> tuple[str, list[tuple[str, str]]]:
    events: list[tuple[str, str]] = []

    while True:
        tool_start = tts_buffer.find(TOOL_OPEN_TAG)
        sentence_match = SENTENCE_END_RE.search(tts_buffer)

        if tool_start == -1:
            if sentence_match is None:
                break

            segment_end = _sentence_segment_end(tts_buffer, sentence_match)
            raw_segment = tts_buffer[:segment_end]
            tts_buffer = tts_buffer[segment_end:]
            _append_sentence_event(events, raw_segment)
            continue

        if sentence_match is not None and sentence_match.start() < tool_start:
            segment_end = _sentence_segment_end(tts_buffer, sentence_match)
            raw_segment = tts_buffer[:segment_end]
            tts_buffer = tts_buffer[segment_end:]
            _append_sentence_event(events, raw_segment)
            continue

        before_tool = tts_buffer[:tool_start]
        if before_tool.strip():
            # The model placed a tool inside an unfinished sentence. Wait for a
            # boundary instead of firing the visual before its preceding words.
            break

        tool_end = tts_buffer.find(TOOL_CLOSE_TAG, tool_start)
        if tool_end == -1:
            break

        tool_end += len(TOOL_CLOSE_TAG)
        raw_tool_tag = tts_buffer[tool_start:tool_end]
        _append_tool_events(events, raw_tool_tag)
        tts_buffer = (tts_buffer[:tool_start] + tts_buffer[tool_end:]).lstrip()

    return tts_buffer, events


def flush_buffer(tts_buffer: str) -> list[tuple[str, str]]:
    """Emit all complete final text/tool events in their original order."""
    events: list[tuple[str, str]] = []

    while tts_buffer.strip():
        tool_start = tts_buffer.find(TOOL_OPEN_TAG)
        if tool_start == -1:
            clean_text = strip_partial_tool_tags(tts_buffer)
            _append_sentence_event(events, clean_text)
            break

        before_tool = strip_partial_tool_tags(tts_buffer[:tool_start])
        _append_sentence_event(events, before_tool)

        tool_end = tts_buffer.find(TOOL_CLOSE_TAG, tool_start)
        if tool_end == -1:
            break

        tool_end += len(TOOL_CLOSE_TAG)
        raw_tool_tag = tts_buffer[tool_start:tool_end]
        _append_tool_events(events, raw_tool_tag)
        tts_buffer = tts_buffer[tool_end:]

    return events


def strip_partial_tool_tags(text: str) -> str:
    text, _ = extract_tool_events(text)
    idx = text.find(TOOL_OPEN_TAG)
    if idx != -1:
        text = text[:idx]
    return text.strip()
