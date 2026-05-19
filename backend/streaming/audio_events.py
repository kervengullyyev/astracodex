from audio.tts import tts_audio_stream_events_for_sentence
from streaming.tool_calls import tokenize_buffer


def process_streaming_buffer(tts_buffer: str) -> tuple[str, list]:
    """Turn buffered model text into ordered tool/audio events."""
    output_events = []
    tts_buffer, events = tokenize_buffer(tts_buffer)

    for kind, payload in events:
        if kind == "TOOL":
            output_events.append(payload)
        elif kind == "SENTENCE":
            for audio_event in tts_audio_stream_events_for_sentence(payload):
                output_events.append(audio_event)

    return tts_buffer, output_events


def stream_sentence_audio_from_buffer(tts_buffer: str):
    return process_streaming_buffer(tts_buffer)
