import json
import threading

from config import DATA_DIR, MAX_THREAD_MESSAGES, THREADS_FILE

thread_lock = threading.Lock()

THREADS: dict[str, list[dict[str, str]]] = {}
QUIZ_SCORES: dict[str, list[dict]] = {}


def load_threads():
    DATA_DIR.mkdir(exist_ok=True)

    if not THREADS_FILE.exists():
        return

    try:
        data = json.loads(THREADS_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            THREADS.clear()
            THREADS.update(data)
    except Exception:
        THREADS.clear()


def save_threads():
    DATA_DIR.mkdir(exist_ok=True)
    THREADS_FILE.write_text(
        json.dumps(THREADS, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
