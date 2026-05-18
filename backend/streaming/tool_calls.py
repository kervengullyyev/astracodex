import json
import re


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
        start = text.find("<tool_call>")
        if start == -1:
            break
        end = text.find("</tool_call>", start)
        if end == -1:
            break
        end += len("</tool_call>")
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


def tokenize_buffer(tts_buffer: str) -> tuple[str, list[tuple[str, str]]]:
    events: list[tuple[str, str]] = []

    tts_buffer, eager_tool_events = extract_tool_events(tts_buffer)
    for tool_event in eager_tool_events:
        events.append(("TOOL", tool_event))

    sentence_end_re = re.compile(r'(?<=[.!?])(?=\s|$)')

    while True:
        match = sentence_end_re.search(tts_buffer)
        if match is None:
            break

        raw_segment = tts_buffer[:match.start() + 1]
        tts_buffer = tts_buffer[match.start() + 1:]

        clean_segment, inline_tool_events = extract_tool_events(raw_segment)
        for tool_event in inline_tool_events:
            events.append(("TOOL", tool_event))

        spoken = clean_segment.strip()
        if len(spoken) > 2:
            events.append(("SENTENCE", spoken))

    return tts_buffer, events


def strip_partial_tool_tags(text: str) -> str:
    text, _ = extract_tool_events(text)
    idx = text.find("<tool_call>")
    if idx != -1:
        text = text[:idx]
    return text.strip()
