import subprocess
from pathlib import Path

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
    whisper_model = WhisperModel("small.en", device=device, compute_type=compute_type)
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
        beam_size=1,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    text = "".join(segment.text for segment in segments)
    return text.strip()
