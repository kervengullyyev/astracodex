def normalize_command_text(text: str) -> str:
    text = (text or "").lower()

    replacements = {
        "don't": "do not",
        "dont": "do not",
        "don t": "do not",
        "doesn't": "does not",
        "doesn t": "does not",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    cleaned = ""

    for ch in text:
        if ch.isalnum() or ch.isspace():
            cleaned += ch
        else:
            cleaned += " "

    return " ".join(cleaned.split())


def requested_section_number_from_text(text: str) -> int | None:
    normalized = normalize_command_text(text)

    words_to_numbers = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
        "ten": 10,
    }

    parts = normalized.split()

    for i, part in enumerate(parts):
        if part == "section" and i + 1 < len(parts):
            value = parts[i + 1]

            if value.isdigit():
                return int(value)

            if value in words_to_numbers:
                return words_to_numbers[value]

    for part in parts:
        if part.startswith("section"):
            suffix = part.replace("section", "")
            if suffix.isdigit():
                return int(suffix)

    return None


def is_continue_command(text: str) -> bool:
    normalized = normalize_command_text(text)

    if normalized in {"kerven"}:
        return True

    phrases = ["kerven"]

    if len(normalized) < 50:
        affirmatives = {"kerven"}
        words = normalized.split()
        if words and words[0] in affirmatives:
            return True

    return any(phrase in normalized for phrase in phrases)


def section_end_question(section_number: int) -> str:
    return f"Do you have any question about Section-{section_number}?"
