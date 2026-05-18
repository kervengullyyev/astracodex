import json
import re
from pathlib import Path


def load_lesson_json(content_file: Path) -> dict:
    if not content_file.exists():
        return {}

    try:
        data = json.loads(content_file.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            print(f"Invalid content.json root type: {type(data).__name__}", flush=True)
            return {}
        return data
    except Exception as e:
        print("Failed to load content.json:", e, flush=True)
        return {}


def section_key(number: int) -> str:
    return f"Section-{number}"


def available_section_numbers(content_file: Path) -> list[int]:
    content = load_lesson_json(content_file)
    sections = content.get("sections", [])
    numbers = []

    for sec in sections:
        sec_id = sec.get("id", "")
        if sec_id.startswith("section-"):
            try:
                numbers.append(int(sec_id.replace("section-", "")))
            except Exception:
                pass

    return sorted(numbers)


def get_current_section_number_from_messages(
    messages: list[dict],
    debug_label: str | None = None,
) -> int:
    current = 1

    for msg in messages:
        content = msg.get("content", "")
        if not isinstance(content, str):
            continue

        if "<tool_call>" in content:
            try:
                starts = [m.start() for m in re.finditer("<tool_call>", content)]
                for start in starts:
                    end = content.find("</tool_call>", start)
                    if end == -1:
                        continue

                    json_str = content[start + 11:end].strip()
                    data = json.loads(json_str)
                    if data.get("name") != "change_section":
                        continue

                    value = data.get("arguments", {}).get("section")
                    if value is None:
                        continue

                    if isinstance(value, str):
                        value = value.lower().replace("section-", "").replace("section", "").strip()
                    try:
                        current = int(value)
                    except Exception:
                        pass
            except Exception:
                pass

        if "Section-" in content:
            match = re.search(r"Section-(\d+)", content)
            if match:
                num = int(match.group(1))
                if num > current:
                    current = num

    if debug_label:
        print(f"DEBUG: get_current_section_number({debug_label}) -> {current}")
    return current


def load_unlocked_sections_text(current_section_number: int, content_file: Path) -> str:
    content = load_lesson_json(content_file)

    unlocked = {
        "Lesson": content.get("lessonTitle", "Unknown"),
        "Teacher": content.get("teacherName", "Unknown"),
        "sections": [],
    }

    sections = content.get("sections", [])
    for sec in sections:
        sec_id = sec.get("id", "")
        if sec_id.startswith("section-"):
            try:
                num = int(sec_id.replace("section-", ""))
                if num <= current_section_number:
                    unlocked["sections"].append(sec)
            except Exception:
                pass

    return json.dumps(unlocked, ensure_ascii=False, indent=2)


def build_quiz_history_text(quiz_scores: list[dict] | None) -> str:
    """Build a text summary of the student's quiz performance for the system prompt."""
    if not quiz_scores:
        return ""

    lines = ["\n# STUDENT QUIZ PERFORMANCE (so far):"]
    total_correct = 0
    total_questions = 0
    for qs in quiz_scores:
        lines.append(f"- Section-{qs['section']}: {qs['score']}/{qs['total']} ({qs['percent']}%)")
        total_correct += qs["score"]
        total_questions += qs["total"]

    if total_questions > 0:
        overall = round((total_correct / total_questions) * 100)
        lines.append(f"- **Overall: {total_correct}/{total_questions} ({overall}%)**")

    lines.append("- Use this data to personalize your encouragement. If this is the LAST section of the lesson, give a warm final summary of their journey.")
    return "\n".join(lines)
