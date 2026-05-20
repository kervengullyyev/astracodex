from config import CONTENT_FILE
from lesson.content import (
    available_section_numbers as lesson_available_section_numbers,
    get_current_section_number_from_messages,
    load_lesson_json as read_lesson_json,
    load_unlocked_sections_text as read_unlocked_sections_text,
)
from lesson.context import build_lesson_context as render_lesson_context
from lesson.navigation import is_continue_command, requested_section_number_from_text
from students.names import remember_student_name, sanitize_student_name
from threads.store import MAX_THREAD_MESSAGES, QUIZ_SCORES, THREADS


def load_lesson_json() -> dict:
    return read_lesson_json(CONTENT_FILE)


def available_section_numbers() -> list[int]:
    return lesson_available_section_numbers(CONTENT_FILE)


def get_current_section_number(thread_id: str) -> int:
    return get_current_section_number_from_messages(THREADS.get(thread_id, []), thread_id)


def load_unlocked_sections_text(current_section_number: int) -> str:
    return read_unlocked_sections_text(current_section_number, CONTENT_FILE)


def build_lesson_context(
    current_section_number: int | None = None,
    viewed_slide: int | None = None,
    quiz_scores: list[dict] | None = None,
    student_name: str | None = None,
) -> str:
    content = load_lesson_json()
    student_name = sanitize_student_name(student_name) or sanitize_student_name(content.get("studentName", ""))
    return render_lesson_context(
        content=content,
        current_section_number=current_section_number,
        viewed_slide=viewed_slide,
        quiz_scores=quiz_scores,
        student_name=student_name,
    )


def lesson_context_messages(
    thread_id: str | None = None,
    viewed_slide: int | None = None,
    student_name: str | None = None,
) -> list[dict]:
    current_section = get_current_section_number(thread_id) if thread_id else None
    quiz_scores = QUIZ_SCORES.get(thread_id, []) if thread_id else []
    student_name = sanitize_student_name(student_name) or remember_student_name(thread_id)
    return [
        {
            "role": "system",
            "content": [{"type": "text", "text": build_lesson_context(current_section, viewed_slide, quiz_scores, student_name)}],
        }
    ]


def build_start_lesson_messages(thread_id: str, student_name: str | None = None) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]
    messages = lesson_context_messages(thread_id, student_name=student_name)

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Start Lesson. Begin with Section-1 only. "
                        "Teach Section-1 clearly. "
                        "Do not teach Section-2 yet. "
                    ),
                }
            ],
        }
    )

    return messages


def build_answer_messages(
    thread_id: str,
    user_text: str,
    viewed_slide: int | None = None,
    student_name: str | None = None,
) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]
    messages = lesson_context_messages(thread_id, viewed_slide, student_name)

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [{"type": "text", "text": user_text.strip()}],
        }
    )

    return messages


def get_next_section_number(thread_id: str) -> int | None:
    current = get_current_section_number(thread_id)

    for number in available_section_numbers():
        if number > current:
            return number

    return None


def get_navigation_target_section(thread_id: str, message: str) -> int | None:
    if not is_continue_command(message):
        return None

    current = get_current_section_number(thread_id)
    requested = requested_section_number_from_text(message)

    if requested is None:
        target = get_next_section_number(thread_id)
        print(f"DEBUG: get_navigation_target_section({thread_id}) -> {target} (requested=None)")
        return target

    if requested == current:
        return get_next_section_number(thread_id)

    if requested == current + 1:
        return requested

    if requested < current:
        return get_next_section_number(thread_id)

    return -1


def build_teach_section_messages(thread_id: str, section_number: int, student_name: str | None = None) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]

    messages = [
        {
            "role": "system",
            "content": [
                {
                    "type": "text",
                    "text": build_lesson_context(section_number, student_name=student_name),
                }
            ],
        },
    ]

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Teach only Section-{section_number}. "
                        f"Do not teach Section-{section_number + 1} or later sections. "
                    ),
                }
            ],
        }
    )

    return messages
