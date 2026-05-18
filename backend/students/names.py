THREAD_STUDENT_NAMES: dict[str, str] = {}


def sanitize_student_name(value) -> str:
    if not isinstance(value, str):
        return ""
    compact = " ".join(value.strip().split())
    safe = "".join(ch for ch in compact if ch.isalnum() or ch in {" ", "-"})
    return safe[:60]


def remember_student_name(thread_id: str | None, student_name: str | None = None) -> str:
    clean_name = sanitize_student_name(student_name)
    if thread_id and clean_name:
        THREAD_STUDENT_NAMES[thread_id] = clean_name
        return clean_name
    if thread_id:
        return THREAD_STUDENT_NAMES.get(thread_id, "")
    return clean_name
