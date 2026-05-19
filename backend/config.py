from pathlib import Path

from dotenv import dotenv_values

BASE_DIR = Path(__file__).parent
ENV_FILE = BASE_DIR / ".env"
ENV_VALUES = dotenv_values(ENV_FILE, interpolate=False)


def _env(name: str, default: str = "") -> str:
    value = ENV_VALUES.get(name)
    if value is None:
        return default

    value = str(value).strip()
    return value or default


def _bool_env(name: str, default: bool = False) -> bool:
    value = _env(name)
    if not value:
        return default

    return value.lower() not in {"0", "false", "no", "off"}


def _int_env(name: str, default: int) -> int:
    value = _env(name)
    if not value:
        return default

    return int(value)


def _float_env(name: str, default: float) -> float:
    value = _env(name)
    if not value:
        return default

    return float(value)


def _csv_env(name: str, default: list[str]) -> list[str]:
    value = _env(name)
    if not value:
        return default

    return [item.strip() for item in value.split(",") if item.strip()]


def _path_env(name: str, default: Path) -> Path:
    value = _env(name, str(default))
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = BASE_DIR / path

    return path


OPENROUTER_BASE_URL = _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_MODEL_ID = _env("OPENROUTER_MODEL_ID", "google/gemma-4-31b-it:nitro")
OPENROUTER_USE_NITRO = _bool_env("OPENROUTER_USE_NITRO", True)
OPENROUTER_PROVIDER_SORT = _env("OPENROUTER_PROVIDER_SORT").lower()
OPENROUTER_API_KEY = _env("OPENROUTER_API_KEY")
OPENROUTER_HTTP_REFERER = _env("OPENROUTER_HTTP_REFERER")
OPENROUTER_X_TITLE = _env("OPENROUTER_X_TITLE", "AstraCodex")

MESSAGE_MAX_TOKENS = _int_env("MESSAGE_MAX_TOKENS", 1024)
TEACH_MAX_TOKENS = _int_env("TEACH_MAX_TOKENS", 4096)
TALK_MAX_TOKENS = _int_env("TALK_MAX_TOKENS", 4096)

HF_HOME = _path_env("HF_HOME", BASE_DIR / ".hf_home")
TORCH_HOME = _path_env("TORCH_HOME", BASE_DIR / ".torch")

STATIC_DIR = _path_env("STATIC_DIR", BASE_DIR / "static")
DATA_DIR = _path_env("DATA_DIR", BASE_DIR / "data")
THREADS_FILE = _path_env("THREADS_FILE", DATA_DIR / "threads.json")
CONTENT_FILE = _path_env("CONTENT_FILE", BASE_DIR.parent / "content.json")

DEFAULT_CORS_ORIGINS = [
    "https://astracodex.online",
    "https://www.astracodex.online",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_ORIGINS = _csv_env("CORS_ALLOW_ORIGINS", DEFAULT_CORS_ORIGINS)
CORS_ALLOW_ORIGIN_REGEX = _env("CORS_ALLOW_ORIGIN_REGEX") or None

MAX_THREAD_MESSAGES = _int_env("MAX_THREAD_MESSAGES", 8)

WHISPER_MODEL_ID = _env("WHISPER_MODEL_ID", "small.en")
WHISPER_BEAM_SIZE = _int_env("WHISPER_BEAM_SIZE", 1)
WHISPER_VAD_MIN_SILENCE_MS = _int_env("WHISPER_VAD_MIN_SILENCE_MS", 500)

KOKORO_VOICE = _env("KOKORO_VOICE", "bm_fable")
KOKORO_SPEED = _float_env("KOKORO_SPEED", 0.9)
KOKORO_LANG = _env("KOKORO_LANG", "en-us")
KOKORO_MODEL_PATH = _path_env("KOKORO_MODEL_PATH", BASE_DIR / "models" / "kokoro-v1.0.onnx")
KOKORO_VOICES_PATH = _path_env("KOKORO_VOICES_PATH", BASE_DIR / "models" / "voices-v1.0.bin")

ELEVENLABS_API_KEY = _env("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = _env("ELEVENLABS_VOICE_ID", "BtWabtumIemAotTjP5sk")

PCM_SAMPLE_RATE = _int_env("PCM_SAMPLE_RATE", 16000)
PCM_CHANNELS = _int_env("PCM_CHANNELS", 1)
VAD_WINDOW_SAMPLES = _int_env("VAD_WINDOW_SAMPLES", 512)

SILERO_VAD_REPO = _env("SILERO_VAD_REPO", "snakers4/silero-vad")
VAD_ENABLED = _bool_env("VAD_ENABLED", True)
VAD_SAMPLE_RATE = _int_env("VAD_SAMPLE_RATE", PCM_SAMPLE_RATE)
VAD_THRESHOLD = _float_env("VAD_THRESHOLD", 0.5)
VAD_MIN_SPEECH_MS = _int_env("VAD_MIN_SPEECH_MS", 250)
VAD_MIN_SILENCE_MS = _int_env("VAD_MIN_SILENCE_MS", 700)
VAD_END_SILENCE_MS = _int_env("VAD_END_SILENCE_MS", 500)
VAD_SPEECH_PAD_MS = _int_env("VAD_SPEECH_PAD_MS", 120)
VAD_MIN_TOTAL_SPEECH_MS = _int_env("VAD_MIN_TOTAL_SPEECH_MS", 300)
VAD_PREROLL_MS = _int_env("VAD_PREROLL_MS", 350)
