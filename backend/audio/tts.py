import base64
import io
import threading

import httpx
import numpy as np
import soundfile as sf
import torch
from kokoro_onnx import Kokoro

from config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID,
    KOKORO_LANG,
    KOKORO_MODEL_PATH,
    KOKORO_SPEED,
    KOKORO_VOICE,
    KOKORO_VOICES_PATH,
)
from streaming.tool_calls import ndjson

kokoro_tts = None
kokoro_lock = threading.Lock()


def load_kokoro():
    global kokoro_tts

    if kokoro_tts is not None:
        return

    print("Loading Kokoro TTS...", flush=True)
    print("Kokoro voice:", KOKORO_VOICE, flush=True)

    model_path = KOKORO_MODEL_PATH
    voices_path = KOKORO_VOICES_PATH

    if not model_path or not voices_path:
        print("Kokoro model or voices path is missing. TTS will be unavailable.", flush=True)
        return

    from pathlib import Path

    model_path = Path(model_path)
    voices_path = Path(voices_path)

    if not model_path.exists() or not voices_path.exists():
        print(f"Kokoro model or voices not found at {model_path}. TTS will be unavailable until downloaded.", flush=True)
        return

    kokoro_tts = Kokoro(str(model_path), str(voices_path))
    print("Kokoro loaded.", flush=True)


def audio_chunk_to_numpy(audio):
    if torch.is_tensor(audio):
        return audio.detach().cpu().numpy()

    return np.asarray(audio)


def tts_audio_stream_events_for_sentence(sentence: str, tts_provider: str = "kokoro"):
    sentence = (sentence or "").strip()

    if not sentence:
        return

    tts_provider = tts_provider.lower()
    print(f"DEBUG TTS: provider={tts_provider}, key_exists={bool(ELEVENLABS_API_KEY)}, voice_id={ELEVENLABS_VOICE_ID}", flush=True)

    if tts_provider == "elevenlabs":
        if not ELEVENLABS_API_KEY:
            print("WARNING: ElevenLabs API key not set, falling back to Kokoro.")
            tts_provider = "kokoro"
        else:
            try:
                response = httpx.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128",
                    headers={
                        "xi-api-key": ELEVENLABS_API_KEY,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": sentence,
                        "model_id": "eleven_multilingual_v2",
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                audio_b64 = base64.b64encode(response.content).decode("ascii")
                yield ndjson(
                    {
                        "type": "audio",
                        "mime": "audio/mpeg",
                        "text": sentence,
                        "audio_b64": audio_b64,
                    }
                )
                return
            except Exception as e:
                import traceback

                print(f"ElevenLabs TTS failed: {e}. Falling back to Kokoro.", flush=True)
                traceback.print_exc()
                tts_provider = "kokoro"

    if tts_provider == "kokoro":
        load_kokoro()
        if kokoro_tts is None:
            return

        with kokoro_lock:
            samples, sample_rate = kokoro_tts.create(
                sentence,
                voice=KOKORO_VOICE,
                speed=KOKORO_SPEED,
                lang=KOKORO_LANG,
            )

        if samples.size == 0:
            return

        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV")
        buffer.seek(0)

        audio_b64 = base64.b64encode(buffer.read()).decode("ascii")

        yield ndjson(
            {
                "type": "audio",
                "mime": "audio/wav",
                "sample_rate": sample_rate,
                "text": sentence,
                "audio_b64": audio_b64,
            }
        )


def text_to_tts_wav_bytes(text: str, tts_provider: str = "kokoro") -> bytes:
    text = (text or "").strip()

    if not text:
        text = "I have nothing to say."

    tts_provider = tts_provider.lower()

    if tts_provider == "elevenlabs":
        if not ELEVENLABS_API_KEY:
            tts_provider = "kokoro"
        else:
            try:
                response = httpx.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128",
                    headers={
                        "xi-api-key": ELEVENLABS_API_KEY,
                        "Content-Type": "application/json",
                    },
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2_5",
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                return response.content
            except Exception as e:
                print(f"ElevenLabs TTS failed: {e}. Falling back to Kokoro.")
                tts_provider = "kokoro"

    if tts_provider == "kokoro":
        load_kokoro()
        if kokoro_tts is None:
            return b""

        with kokoro_lock:
            samples, sample_rate = kokoro_tts.create(
                text,
                voice=KOKORO_VOICE,
                speed=KOKORO_SPEED,
                lang=KOKORO_LANG,
            )

        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format="WAV")
        buffer.seek(0)

        return buffer.read()

    return b""
