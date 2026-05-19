import subprocess
from pathlib import Path

from config import HF_HOME, WHISPER_BEAM_SIZE, WHISPER_MODEL_ID, WHISPER_VAD_MIN_SILENCE_MS
import torch
from faster_whisper import WhisperModel

whisper_model = None


def load_model():
    global whisper_model

    if whisper_model is not None:
        return

    print("Loading Whisper model...", flush=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    HF_HOME.mkdir(parents=True, exist_ok=True)
    whisper_model = WhisperModel(
        WHISPER_MODEL_ID,
        device=device,
        compute_type=compute_type,
        download_root=str(HF_HOME),
    )
    print("Whisper loaded.", flush=True)


def convert_to_wav_16k_mono(input_path: Path, output_path: Path):
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-t",
        "10",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]

    subprocess.run(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=True,
    )


@torch.inference_mode()
def transcribe_audio(wav_path: Path) -> str:
    load_model()

    segments, _ = whisper_model.transcribe(
        str(wav_path),
        beam_size=WHISPER_BEAM_SIZE,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=WHISPER_VAD_MIN_SILENCE_MS),
    )

    text = "".join(segment.text for segment in segments)
    return text.strip()
