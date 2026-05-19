import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).parent

os.environ.setdefault("HF_HOME", os.path.join(os.getcwd(), ".hf_home"))
os.environ.setdefault("TORCH_HOME", os.path.join(os.getcwd(), ".torch"))

OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")
OPENROUTER_MODEL_ID = os.getenv("OPENROUTER_MODEL_ID", "google/gemma-4-31b-it:nitro")
OPENROUTER_USE_NITRO = os.getenv("OPENROUTER_USE_NITRO", "1") != "0"
OPENROUTER_PROVIDER_SORT = os.getenv("OPENROUTER_PROVIDER_SORT", "").strip().lower()
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_HTTP_REFERER = os.getenv("OPENROUTER_HTTP_REFERER", "")
OPENROUTER_X_TITLE = os.getenv("OPENROUTER_X_TITLE", "Force Lesson Audio Assistant")

MESSAGE_MAX_TOKENS = int(os.getenv("MESSAGE_MAX_TOKENS", "1024"))
TEACH_MAX_TOKENS = int(os.getenv("TEACH_MAX_TOKENS", "4096"))
TALK_MAX_TOKENS = int(os.getenv("TALK_MAX_TOKENS", "4096"))

STATIC_DIR = BASE_DIR / "static"
DATA_DIR = BASE_DIR / "data"
THREADS_FILE = DATA_DIR / "threads.json"
CONTENT_FILE = BASE_DIR.parent / "content.json"

DEFAULT_CORS_ORIGINS = [
    "https://astracodex.online",
    "https://www.astracodex.online",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS)).split(",")
    if origin.strip()
]
CORS_ALLOW_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX", "").strip() or None

MAX_THREAD_MESSAGES = 8

KOKORO_VOICE = os.getenv("KOKORO_VOICE", "bm_fable")
KOKORO_SPEED = float(os.getenv("KOKORO_SPEED", "0.9"))
KOKORO_LANG = os.getenv("KOKORO_LANG", "en-us")
KOKORO_MODEL_PATH = os.getenv("KOKORO_MODEL_PATH", str(BASE_DIR / "models" / "kokoro-v1.0.onnx"))
KOKORO_VOICES_PATH = os.getenv("KOKORO_VOICES_PATH", str(BASE_DIR / "models" / "voices-v1.0.bin"))

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
if not ELEVENLABS_API_KEY:
    load_dotenv(override=True)
    ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "BtWabtumIemAotTjP5sk")

print(f"ELEVENLABS_API_KEY set: {bool(ELEVENLABS_API_KEY)}", flush=True)
print(f"ELEVENLABS_VOICE_ID: {ELEVENLABS_VOICE_ID}", flush=True)

PCM_SAMPLE_RATE = 16000
PCM_CHANNELS = 1
VAD_WINDOW_SAMPLES = 512

VAD_ENABLED = os.getenv("VAD_ENABLED", "1") != "0"
VAD_SAMPLE_RATE = PCM_SAMPLE_RATE
VAD_THRESHOLD = float(os.getenv("VAD_THRESHOLD", "0.5"))
VAD_MIN_SPEECH_MS = int(os.getenv("VAD_MIN_SPEECH_MS", "250"))
VAD_MIN_SILENCE_MS = int(os.getenv("VAD_MIN_SILENCE_MS", "700"))
VAD_END_SILENCE_MS = int(os.getenv("VAD_END_SILENCE_MS", "500"))
VAD_SPEECH_PAD_MS = int(os.getenv("VAD_SPEECH_PAD_MS", "120"))
VAD_MIN_TOTAL_SPEECH_MS = int(os.getenv("VAD_MIN_TOTAL_SPEECH_MS", "300"))
VAD_PREROLL_MS = int(os.getenv("VAD_PREROLL_MS", "350"))
