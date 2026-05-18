import io
import os
import threading
from collections import deque
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from config import (
    PCM_SAMPLE_RATE,
    VAD_ENABLED,
    VAD_END_SILENCE_MS,
    VAD_MIN_SILENCE_MS,
    VAD_MIN_SPEECH_MS,
    VAD_MIN_TOTAL_SPEECH_MS,
    VAD_PREROLL_MS,
    VAD_SAMPLE_RATE,
    VAD_SPEECH_PAD_MS,
    VAD_THRESHOLD,
    VAD_WINDOW_SAMPLES,
)

vad_lock = threading.Lock()
silero_vad_lock = vad_lock
silero_vad_model = None
silero_vad_utils = None
silero_get_speech_timestamps = None


def load_silero_vad():
    global silero_vad_model, silero_vad_utils, silero_get_speech_timestamps

    if not VAD_ENABLED:
        print("Silero VAD disabled with VAD_ENABLED=0.", flush=True)
        return

    if (
        silero_vad_model is not None
        and silero_vad_utils is not None
        and silero_get_speech_timestamps is not None
    ):
        return

    print("Loading Silero VAD...", flush=True)
    repo = os.getenv("SILERO_VAD_REPO", "snakers4/silero-vad")

    try:
        vad_model, utils = torch.hub.load(
            repo_or_dir=repo,
            model="silero_vad",
            force_reload=False,
            trust_repo=True,
        )
    except TypeError:
        vad_model, utils = torch.hub.load(
            repo_or_dir=repo,
            model="silero_vad",
            force_reload=False,
        )

    silero_vad_model = vad_model.to("cpu").eval()
    silero_vad_utils = utils
    silero_get_speech_timestamps = utils[0]

    print("Silero VAD loaded.", flush=True)


def trim_wav_with_silero_vad(input_wav_path: Path, output_wav_path: Path) -> tuple[Path | None, dict]:
    """Return a speech-only WAV path, or None when no real speech is detected."""
    if not VAD_ENABLED:
        return input_wav_path, {"enabled": False}

    load_silero_vad()

    audio_np, sample_rate = sf.read(input_wav_path, dtype="float32")

    if audio_np.ndim > 1:
        audio_np = audio_np.mean(axis=1)

    if sample_rate != VAD_SAMPLE_RATE:
        raise ValueError(f"Expected {VAD_SAMPLE_RATE} Hz audio for VAD, got {sample_rate} Hz")

    if audio_np.size == 0:
        return None, {"enabled": True, "speech_detected": False, "reason": "empty_audio"}

    wav_tensor = torch.from_numpy(audio_np).float().cpu()

    with vad_lock:
        speech_timestamps = silero_get_speech_timestamps(
            wav_tensor,
            silero_vad_model,
            sampling_rate=VAD_SAMPLE_RATE,
            threshold=VAD_THRESHOLD,
            min_speech_duration_ms=VAD_MIN_SPEECH_MS,
            min_silence_duration_ms=VAD_MIN_SILENCE_MS,
            speech_pad_ms=VAD_SPEECH_PAD_MS,
        )

    speech_samples = sum(ts["end"] - ts["start"] for ts in speech_timestamps)
    speech_ms = int((speech_samples / VAD_SAMPLE_RATE) * 1000)

    stats = {
        "enabled": True,
        "speech_detected": bool(speech_timestamps),
        "speech_ms": speech_ms,
        "chunks": len(speech_timestamps),
        "threshold": VAD_THRESHOLD,
    }

    if not speech_timestamps or speech_ms < VAD_MIN_TOTAL_SPEECH_MS:
        stats["speech_detected"] = False
        stats["reason"] = "no_speech_or_too_short"
        return None, stats

    speech_parts = [audio_np[ts["start"]:ts["end"]] for ts in speech_timestamps]
    speech_audio = np.concatenate(speech_parts).astype(np.float32)

    sf.write(output_wav_path, speech_audio, VAD_SAMPLE_RATE, format="WAV")

    return output_wav_path, stats


def pcm16_bytes_to_float32(audio_bytes: bytes) -> np.ndarray:
    if not audio_bytes:
        return np.empty(0, dtype=np.float32)

    pcm = np.frombuffer(audio_bytes, dtype="<i2")
    if pcm.size == 0:
        return np.empty(0, dtype=np.float32)

    return (pcm.astype(np.float32) / 32768.0).clip(-1.0, 1.0)


class StreamingVadSession:
    def __init__(self):
        load_silero_vad()

        if silero_vad_utils is None or silero_vad_model is None:
            raise RuntimeError("Silero VAD is not loaded.")

        _, _, _, VADIterator, _ = silero_vad_utils
        self.vad_iterator = VADIterator(
            silero_vad_model,
            threshold=VAD_THRESHOLD,
            sampling_rate=PCM_SAMPLE_RATE,
            min_silence_duration_ms=VAD_END_SILENCE_MS,
            speech_pad_ms=VAD_SPEECH_PAD_MS,
        )

        self.pending = np.empty(0, dtype=np.float32)
        preroll_frames = max(1, int((PCM_SAMPLE_RATE * VAD_PREROLL_MS / 1000) / VAD_WINDOW_SAMPLES))
        self.preroll = deque(maxlen=preroll_frames)
        self.frames: list[np.ndarray] = []
        self.triggered = False
        self.total_audio_samples = 0

    def reset(self):
        self.pending = np.empty(0, dtype=np.float32)
        self.preroll.clear()
        self.frames.clear()
        self.triggered = False
        self.total_audio_samples = 0
        try:
            self.vad_iterator.reset_states()
        except Exception:
            pass

    def add_pcm16(self, audio_bytes: bytes) -> bytes | None:
        audio = pcm16_bytes_to_float32(audio_bytes)
        if audio.size == 0:
            return None

        self.pending = np.concatenate([self.pending, audio])

        while self.pending.size >= VAD_WINDOW_SAMPLES:
            frame = self.pending[:VAD_WINDOW_SAMPLES]
            self.pending = self.pending[VAD_WINDOW_SAMPLES:]
            self.total_audio_samples += frame.size

            tensor = torch.from_numpy(frame)
            with silero_vad_lock:
                speech_event = self.vad_iterator(tensor, return_seconds=False)

            if not self.triggered:
                self.preroll.append(frame.copy())

            if speech_event and "start" in speech_event and not self.triggered:
                self.triggered = True
                self.frames.extend([x.copy() for x in self.preroll])
                self.preroll.clear()

            if self.triggered:
                self.frames.append(frame.copy())

            if speech_event and "end" in speech_event and self.triggered:
                return self.to_wav_bytes()

        return None

    def to_wav_bytes(self) -> bytes | None:
        if not self.frames:
            return None

        audio = np.concatenate(self.frames).astype(np.float32)
        duration_ms = int(audio.size / PCM_SAMPLE_RATE * 1000)

        if duration_ms < VAD_MIN_TOTAL_SPEECH_MS:
            return None

        buffer = io.BytesIO()
        sf.write(buffer, audio, PCM_SAMPLE_RATE, format="WAV")
        buffer.seek(0)
        return buffer.read()
