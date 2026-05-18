import asyncio
import base64
import io
import json
import queue
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse

BASE_DIR = Path(__file__).parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from audio.speech import convert_to_wav_16k_mono, load_model, transcribe_audio
from audio.tts import load_kokoro, text_to_tts_wav_bytes, tts_audio_stream_events_for_sentence
from audio.vad import StreamingVadSession, load_silero_vad, trim_wav_with_silero_vad
import audio.vad as vad_runtime
from config import (
    CONTENT_FILE,
    CORS_ALLOW_ORIGIN_REGEX,
    CORS_ALLOW_ORIGINS,
    KOKORO_LANG,
    KOKORO_SPEED,
    KOKORO_VOICE,
    MESSAGE_MAX_TOKENS,
    OPENROUTER_PROVIDER_SORT,
    PCM_CHANNELS,
    PCM_SAMPLE_RATE,
    STATIC_DIR,
    TALK_MAX_TOKENS,
    TEACH_MAX_TOKENS,
    VAD_ENABLED,
    VAD_END_SILENCE_MS,
    VAD_MIN_SILENCE_MS,
    VAD_THRESHOLD,
)
from lesson.content import (
    available_section_numbers as lesson_available_section_numbers,
    get_current_section_number_from_messages,
    load_lesson_json as read_lesson_json,
    load_unlocked_sections_text as read_unlocked_sections_text,
)
from lesson.context import build_lesson_context as render_lesson_context
from lesson.navigation import is_continue_command, requested_section_number_from_text
from llm.openrouter import (
    clean_response,
    effective_openrouter_model_id,
    is_response_truncated,
    stream_text_from_messages,
)
from streaming.tool_calls import (
    extract_tool_events as _extract_tool_events,
    ndjson,
    strip_partial_tool_tags as _strip_partial_tool_tags,
    tokenize_buffer as _tokenize_buffer,
)
from students.names import remember_student_name, sanitize_student_name
from threads.store import MAX_THREAD_MESSAGES, QUIZ_SCORES, THREADS, load_threads, save_threads, thread_lock

# Transcription uses local WhisperModel via faster-whisper.
# Teaching / answering text generation uses OpenRouter.

app = FastAPI(title="Force Lesson Audio Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_lesson_json() -> dict:
    return read_lesson_json(CONTENT_FILE)


def available_section_numbers() -> list[int]:
    return lesson_available_section_numbers(CONTENT_FILE)


def get_current_section_number(thread_id: str) -> int:
    return get_current_section_number_from_messages(THREADS.get(thread_id, []), thread_id)


def load_unlocked_sections_text(current_section_number: int) -> str:
    return read_unlocked_sections_text(current_section_number, CONTENT_FILE)


def build_lesson_context(
    current_section_number: int | None = None,
    viewed_slide: int | None = None,
    quiz_scores: list[dict] | None = None,
    student_name: str | None = None,
) -> str:
    content = load_lesson_json()
    student_name = sanitize_student_name(student_name) or sanitize_student_name(content.get("studentName", ""))
    return render_lesson_context(
        content=content,
        current_section_number=current_section_number,
        viewed_slide=viewed_slide,
        quiz_scores=quiz_scores,
        student_name=student_name,
    )


def lesson_context_messages(
    thread_id: str | None = None,
    viewed_slide: int | None = None,
    student_name: str | None = None,
) -> list[dict]:
    current_section = get_current_section_number(thread_id) if thread_id else None
    quiz_scores = QUIZ_SCORES.get(thread_id, []) if thread_id else []
    student_name = sanitize_student_name(student_name) or remember_student_name(thread_id)
    return [
        {
            "role": "user",
            "content": [{"type": "text", "text": build_lesson_context(current_section, viewed_slide, quiz_scores, student_name)}],
        },
        {
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "I understand. I will teach the lesson section by section, "
                        "use only the provided lesson content, and manage progress from the conversation."
                    ),
                }
            ],
        },
    ]


@app.on_event("startup")
def startup():
    load_threads()
    # Load models in a background thread to prevent blocking the server startup.
    # The application will still load them lazily if they are not ready when needed.
    threading.Thread(target=load_model, daemon=True).start()
    threading.Thread(target=load_kokoro, daemon=True).start()
    threading.Thread(target=load_silero_vad, daemon=True).start()


def build_start_lesson_messages(thread_id: str, student_name: str | None = None) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]

    messages = lesson_context_messages(thread_id, student_name=student_name)

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Start Lesson. Begin with Section-1 only. "
                        "Teach Section-1 clearly. "
                        "Do not teach Section-2 yet. "
                    ),
                }
            ],
        }
    )

    return messages


def build_answer_messages(
    thread_id: str,
    user_text: str,
    viewed_slide: int | None = None,
    student_name: str | None = None,
) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]

    messages = lesson_context_messages(thread_id, viewed_slide, student_name)

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [{"type": "text", "text": user_text.strip()}],
        }
    )

    return messages




def process_streaming_buffer(tts_buffer: str) -> tuple[str, list]:
    """Process the streaming TTS buffer, interleaving tool events correctly.

    Tool events are emitted EAGERLY — the moment </tool_call> is seen in the
    buffer, the event fires immediately, before Supertonic even starts on the next
    sentence.  This gives maximum lead time so the cursor is already visible
    when the audio begins.

    NOTE: This function generates TTS audio INLINE (blocking).  It is kept for
    the synchronous ``talk_stream_generator`` path.  The threaded generators
    (message / teach) use ``_tokenize_buffer`` + the tts_worker thread instead.
    """
    import re
    output_events = []

    # 1. Eagerly fire any complete tool calls sitting anywhere in the buffer,
    #    even if no sentence boundary has arrived yet.
    tts_buffer, eager_tool_events = _extract_tool_events(tts_buffer)
    output_events.extend(eager_tool_events)

    # 2. Now split on sentence boundaries and synthesise audio.
    sentence_end_re = re.compile(r'(?<=[.!?])(?=\s|$)')

    while True:
        m = sentence_end_re.search(tts_buffer)
        if m is None:
            break

        raw_segment = tts_buffer[:m.start() + 1]
        tts_buffer = tts_buffer[m.start() + 1:]

        # Strip any tool calls that slipped inside a sentence (shouldn't happen
        # with the new prompt, but be safe).
        clean_segment, inline_tool_events = _extract_tool_events(raw_segment)
        output_events.extend(inline_tool_events)

        spoken = clean_segment.strip()
        if len(spoken) > 2:
            for audio_event in tts_audio_stream_events_for_sentence(spoken):
                output_events.append(audio_event)

    return tts_buffer, output_events


def stream_sentence_audio_from_buffer(tts_buffer: str):
    """Public helper: process buffer and return (remaining_buffer, events)."""
    return process_streaming_buffer(tts_buffer)



def get_next_section_number(thread_id: str) -> int | None:
    current = get_current_section_number(thread_id)

    for number in available_section_numbers():
        if number > current:
            return number

    return None


def get_navigation_target_section(thread_id: str, message: str) -> int | None:
    if not is_continue_command(message):
        return None

    current = get_current_section_number(thread_id)
    requested = requested_section_number_from_text(message)

    if requested is None:
        target = get_next_section_number(thread_id)
        print(f"DEBUG: get_navigation_target_section({thread_id}) -> {target} (requested=None)")
        return target

    # Allow only same/current-next or immediate next.
    # Example: current=1, requested=2 => okay.
    # Example: current=1, requested=5 => not okay.
    if requested == current:
        return get_next_section_number(thread_id)

    if requested == current + 1:
        return requested

    if requested < current:
        return get_next_section_number(thread_id)

    return -1


def build_teach_section_messages(thread_id: str, section_number: int, student_name: str | None = None) -> list[dict]:
    old_messages = THREADS.get(thread_id, [])[-MAX_THREAD_MESSAGES:]

    messages = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": build_lesson_context(section_number, student_name=student_name),
                }
            ],
        },
        {
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"I understand. I may use Section-1 through Section-{section_number}. "
                        f"I will now teach only Section-{section_number}."
                    ),
                }
            ],
        },
    ]

    for msg in old_messages:
        messages.append(
            {
                "role": msg["role"],
                "content": [{"type": "text", "text": msg["content"]}],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        f"Teach only Section-{section_number}. "
                        f"Do not teach Section-{section_number + 1} or later sections. "
                    ),
                }
            ],
        }
    )

    return messages


def teach_section_stream_generator(
    thread_id: str,
    section_number: int,
    tts_provider: str = "kokoro",
    student_name: str | None = None,
):
    tts_provider = tts_provider.lower()
    if not thread_id:
        thread_id = str(uuid.uuid4())

    with thread_lock:
        THREADS.setdefault(thread_id, [])
        student_name = remember_student_name(thread_id, student_name)

    if section_number == -1:
        reply = "We are not there yet. We'll get there."

        for event in tts_audio_stream_events_for_sentence(reply):
            yield event

        yield ndjson(
            {
                "type": "done",
                "thread_id": thread_id,
                "answer": reply,
                "messages": THREADS[thread_id],
            }
        )
        return

    if section_number not in available_section_numbers():
        reply = "The lesson is finished."

        for event in tts_audio_stream_events_for_sentence(reply):
            yield event

        yield ndjson(
            {
                "type": "done",
                "thread_id": thread_id,
                "answer": reply,
                "messages": THREADS[thread_id],
            }
        )
        return

    try:
        yield ndjson(
            {
                "type": "lesson_started",
                "thread_id": thread_id,
                "section": f"Section-{section_number}",
            }
        )

        output_queue = queue.Queue()
        tts_queue = queue.Queue()
        llm_finished = threading.Event()

        def network_worker():
            try:
                full_answer = ""
                tts_buffer = ""
                messages = build_teach_section_messages(thread_id, section_number, student_name)

                for delta in stream_text_from_messages(messages, max_new_tokens=TEACH_MAX_TOKENS):
                    if not delta:
                        continue

                    full_answer += delta
                    tts_buffer += delta

                    # _tokenize_buffer is FAST — no TTS here.  The tts_worker
                    # thread handles all audio generation, keeping the HTTP
                    # stream flowing without blocking.
                    tts_buffer, events = _tokenize_buffer(tts_buffer)
                    for kind, payload in events:
                        tts_queue.put((kind, payload))

                # Flush remainder — strip partial tags before TTS.
                if tts_buffer.strip():
                    clean_rem, tool_events = _extract_tool_events(tts_buffer.strip())
                    for te in tool_events:
                        tts_queue.put(("TOOL", te))
                    clean_rem = _strip_partial_tool_tags(clean_rem)
                    if clean_rem.strip():
                        tts_queue.put(("SENTENCE", clean_rem.strip()))

                clean_full = clean_response(full_answer)
                output_queue.put(("FULL_ANSWER", clean_full))

            except Exception as e:
                output_queue.put(ndjson({"type": "error", "error": "MODEL_FAILED", "details": str(e)}))
            finally:
                llm_finished.set()

        def tts_worker():
            while True:
                try:
                    item = tts_queue.get(timeout=0.5)
                except queue.Empty:
                    if llm_finished.is_set() and tts_queue.empty():
                        break
                    continue

                if isinstance(item, tuple):
                    kind, payload = item
                    if kind == "TOOL":
                        # Tool event: already rendered ndjson — emit immediately.
                        output_queue.put(payload)
                    elif kind in ("SENTENCE", "TEXT"):
                        # TTS generation happens HERE, in the dedicated TTS thread.
                        try:
                            for event in tts_audio_stream_events_for_sentence(payload, tts_provider=tts_provider):
                                output_queue.put(event)
                        except Exception as e:
                            output_queue.put(ndjson({"type": "error", "error": "TTS_FAILED", "details": str(e)}))
                    elif kind == "RAW_EVENT":
                        # Legacy path.
                        output_queue.put(payload)

                tts_queue.task_done()
            output_queue.put("TTS_DONE")

        t_net = threading.Thread(target=network_worker, daemon=True)
        t_tts = threading.Thread(target=tts_worker, daemon=True)
        t_net.start()
        t_tts.start()

        full_answer_final = ""

        while True:
            if llm_finished.is_set() and not t_tts.is_alive() and output_queue.empty():
                break
            try:
                event = output_queue.get(timeout=0.1)
                if event == "TTS_DONE":
                    continue
                if isinstance(event, tuple) and event[0] == "FULL_ANSWER":
                    full_answer_final = event[1]
                    continue
                yield event
            except queue.Empty:
                pass

        with thread_lock:
            THREADS[thread_id].append(
                {
                    "role": "user",
                    "content": f"Start Lesson: Teach Section-{section_number}.",
                }
            )
            THREADS[thread_id].append(
                {
                    "role": "assistant",
                    "content": full_answer_final,
                }
            )
            THREADS[thread_id] = THREADS[thread_id][-MAX_THREAD_MESSAGES:]
            save_threads()

        yield ndjson(
            {
                "type": "done",
                "thread_id": thread_id,
                "answer": full_answer_final,
                "messages": THREADS[thread_id],
            }
        )

    except Exception as e:
        yield ndjson(
            {
                "type": "error",
                "error": "MODEL_FAILED",
                "details": str(e),
            }
        )


def start_lesson_stream_generator(thread_id: str, tts_provider: str = "kokoro", student_name: str | None = None):
    tts_provider = tts_provider.lower()
    print(f"DEBUG START STREAM: tts_provider={tts_provider}", flush=True)
    return teach_section_stream_generator(thread_id=thread_id, section_number=1, tts_provider=tts_provider, student_name=student_name)




def message_stream_generator(
    thread_id: str,
    message: str,
    stop_event: threading.Event | None = None,
    viewed_slide: int | None = None,
    tts_provider: str = "kokoro",
    student_name: str | None = None,
):
    tts_provider = tts_provider.lower()
    print(f"DEBUG MSG STREAM: tts_provider={tts_provider}", flush=True)
    if not thread_id:
        thread_id = str(uuid.uuid4())

    message = (message or "").strip()

    if not message:
        yield ndjson(
            {
                "type": "error",
                "error": "EMPTY_MESSAGE",
                "details": "No speech was transcribed.",
            }
        )
        return

    with thread_lock:
        THREADS.setdefault(thread_id, [])
        student_name = remember_student_name(thread_id, student_name)

    # PROACTIVE SECTION SWITCH:
    # If the user says "move on", we switch the UI immediately so that Einstein's
    # following response (and any tool calls) happens in the correct visual context.
    # BUT: Never trigger navigation for system events (quiz results, etc.)
    is_system_event = message.startswith("[SYSTEM_EVENT")
    target_section = None
    
    if not is_system_event:
        target_section = get_navigation_target_section(thread_id, message)
        if target_section and target_section > 0:
            viewed_slide = target_section # Update for the prompt builder
            yield ndjson(
                {
                    "type": "lesson_started",
                    "thread_id": thread_id,
                    "section": f"Section-{target_section}",
                }
            )
    
    # Parse and store quiz scores for later summary
    if is_system_event and "QUIZ_FINISHED" in message:
        import re as _re
        score_match = _re.search(r'score\s+(\d+)/(\d+)\s+\((\d+)%\)', message)
        if score_match:
            current_sec = get_current_section_number(thread_id)
            with thread_lock:
                QUIZ_SCORES.setdefault(thread_id, []).append({
                    "section": current_sec,
                    "score": int(score_match.group(1)),
                    "total": int(score_match.group(2)),
                    "percent": int(score_match.group(3)),
                })

    try:
        yield ndjson(
            {
                "type": "transcript",
                "thread_id": thread_id,
                "transcript": message,
            }
        )

        output_queue = queue.Queue()
        tts_queue = queue.Queue()
        llm_finished = threading.Event()
        
        def network_worker():
            try:
                full_answer = ""
                tts_buffer = ""
                messages = build_answer_messages(thread_id, message, viewed_slide, student_name)

                for delta in stream_text_from_messages(messages, max_new_tokens=MESSAGE_MAX_TOKENS, stop_event=stop_event):
                    if stop_event is not None and stop_event.is_set():
                        break

                    if not delta:
                        continue

                    full_answer += delta
                    tts_buffer += delta

                    # _tokenize_buffer is FAST — it only extracts tool calls and
                    # splits sentences.  No TTS happens here, so the HTTP stream
                    # from OpenRouter keeps flowing without blocking.
                    tts_buffer, events = _tokenize_buffer(tts_buffer)
                    for kind, payload in events:
                        tts_queue.put((kind, payload))

                # Flush remainder — strip partial tags before TTS.
                if tts_buffer.strip():
                    clean_rem, tool_events = _extract_tool_events(tts_buffer.strip())
                    for te in tool_events:
                        tts_queue.put(("TOOL", te))
                    clean_rem = _strip_partial_tool_tags(clean_rem)
                    if clean_rem.strip():
                        tts_queue.put(("SENTENCE", clean_rem.strip()))

                # Save clean answer (no raw tool-call XML) to thread history.
                clean_full, _ = _extract_tool_events(full_answer)
                clean_full = clean_response(clean_full)

                if is_response_truncated(clean_full):
                    print(
                        f"WARNING: message_stream response appears truncated "
                        f"(last char: {clean_full[-5:]!r}, length: {len(clean_full)}). "
                        f"Consider raising MESSAGE_MAX_TOKENS (currently {MESSAGE_MAX_TOKENS}).",
                        flush=True,
                    )

                output_queue.put(("FULL_ANSWER", clean_full))
                output_queue.put(("RAW_ANSWER", full_answer))

            except Exception as e:
                output_queue.put(ndjson({"type": "error", "error": "MODEL_FAILED", "details": str(e)}))
            finally:
                llm_finished.set()

        def tts_worker():
            while True:
                try:
                    item = tts_queue.get(timeout=0.5)
                except queue.Empty:
                    if llm_finished.is_set() and tts_queue.empty():
                        break
                    continue

                if stop_event is not None and stop_event.is_set():
                    break

                if isinstance(item, tuple):
                    kind, payload = item
                    if kind == "TOOL":
                        # Tool event: already rendered ndjson — emit immediately.
                        output_queue.put(payload)
                    elif kind in ("SENTENCE", "TEXT"):
                        # TTS generation happens HERE, in the dedicated TTS
                        # thread — the network worker stays fast.
                        for event in tts_audio_stream_events_for_sentence(payload, tts_provider=tts_provider):
                            if stop_event is not None and stop_event.is_set():
                                break
                            output_queue.put(event)
                    elif kind == "RAW_EVENT":
                        # Legacy path (kept for backward compat).
                        output_queue.put(payload)

                tts_queue.task_done()
            output_queue.put("TTS_DONE")

        # Start the background threads
        t_net = threading.Thread(target=network_worker, daemon=True)
        t_tts = threading.Thread(target=tts_worker, daemon=True)
        t_net.start()
        t_tts.start()

        full_answer_final = ""
        full_answer_raw = ""
        
        # Main thread acts as consumer and yields perfectly sequentially back to web framework
        while True:
            if llm_finished.is_set() and not t_tts.is_alive() and output_queue.empty():
                break
                
            try:
                event = output_queue.get(timeout=0.1)
                
                if event == "TTS_DONE":
                    continue
                    
                if isinstance(event, tuple):
                    if event[0] == "FULL_ANSWER":
                        full_answer_final = event[1]
                        continue
                    if event[0] == "RAW_ANSWER":
                        full_answer_raw = event[1]
                        continue
                    
                yield event
            except queue.Empty:
                pass

        if stop_event is not None and stop_event.is_set():
            return

        # Check if the AI used change_section, or if we proactively switched, and inject the transition
        # We must use the RAW answer here because full_answer_final was already stripped of tags.
        _, tool_events = _extract_tool_events(full_answer_raw)
        
        # Collect all section transitions (proactive + AI-initiated)
        seen_sections = set()
        
        # 1. Check if we proactively switched
        if target_section and target_section > 0:
            seen_sections.add(int(target_section))
            
        # 2. Check if the AI also used the tool
        for te in tool_events:
            try:
                obj = json.loads(te)
                if obj.get("type") == "lesson_started":
                    raw_val = str(obj.get("section", ""))
                    clean_num = raw_val.lower().replace("section-", "").replace("section", "").strip()
                    try:
                        seen_sections.add(int(clean_num))
                    except ValueError:
                        pass
            except Exception:
                pass

        with thread_lock:
            # Append user message to thread history
            THREADS[thread_id].append({"role": "user", "content": message})
            # Save each transition as a proper tool_call marker
            for sec_num in sorted(seen_sections):
                THREADS[thread_id].append({"role": "assistant", "content": f'<tool_call>{{"name": "change_section", "arguments": {{"section": {sec_num}}}}}</tool_call>'})
            THREADS[thread_id].append({"role": "assistant", "content": full_answer_final})
            THREADS[thread_id] = THREADS[thread_id][-MAX_THREAD_MESSAGES:]
            save_threads()

        yield ndjson(
            {
                "type": "done",
                "thread_id": thread_id,
                "answer": full_answer_final,
                "messages": THREADS[thread_id],
            }
        )

    except Exception as e:
        yield ndjson(
            {
                "type": "error",
                "error": "MODEL_FAILED",
                "details": str(e),
            }
        )




def talk_stream_generator(
    audio_bytes: bytes,
    filename: str,
    thread_id: str,
    tts_provider: str = "kokoro",
    student_name: str | None = None,
):
    if not thread_id:
        thread_id = str(uuid.uuid4())

    with thread_lock:
        THREADS.setdefault(thread_id, [])
        student_name = remember_student_name(thread_id, student_name)

    suffix = Path(filename or "audio.webm").suffix or ".webm"

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)

            raw_path = tmpdir_path / f"input-{uuid.uuid4().hex}{suffix}"
            wav_path = tmpdir_path / f"audio-{uuid.uuid4().hex}.wav"
            speech_wav_path = tmpdir_path / f"speech-{uuid.uuid4().hex}.wav"

            raw_path.write_bytes(audio_bytes)

            convert_to_wav_16k_mono(raw_path, wav_path)

            vad_wav_path, vad_stats = trim_wav_with_silero_vad(wav_path, speech_wav_path)

            yield ndjson(
                {
                    "type": "vad",
                    "thread_id": thread_id,
                    **vad_stats,
                }
            )

            if vad_wav_path is None:
                yield ndjson(
                    {
                        "type": "done",
                        "thread_id": thread_id,
                        "answer": "",
                        "messages": THREADS[thread_id],
                    }
                )
                return

            transcript = transcribe_audio(vad_wav_path)

            if not transcript:
                transcript = "[unclear audio]"

            yield ndjson(
                {
                    "type": "transcript",
                    "thread_id": thread_id,
                    "transcript": transcript,
                }
            )

            full_answer = ""
            tts_buffer = ""
            messages = build_answer_messages(thread_id, transcript, student_name=student_name)

            for delta in stream_text_from_messages(messages, max_new_tokens=TALK_MAX_TOKENS):
                if not delta:
                    continue

                full_answer += delta
                tts_buffer += delta

                # process_streaming_buffer fires tool events BEFORE sentence audio.
                tts_buffer, output_events = process_streaming_buffer(tts_buffer)
                for event in output_events:
                    yield event

            # Flush remainder — strip partial tags before TTS.
            if tts_buffer.strip():
                clean_rem, tool_events = _extract_tool_events(tts_buffer.strip())
                for te in tool_events:
                    yield te
                clean_rem = _strip_partial_tool_tags(clean_rem)
                if clean_rem.strip():
                    for event in tts_audio_stream_events_for_sentence(clean_rem.strip(), tts_provider=tts_provider):
                        yield event

            # Store clean answer in thread history.
            clean_full, raw_tool_events = _extract_tool_events(full_answer)
            full_answer = clean_response(clean_full)
            
            transitions = []
            for te in raw_tool_events:
                try:
                    obj = json.loads(te)
                    if obj.get("type") == "lesson_started":
                        sec_num = int(obj.get("section").replace("Section-", ""))
                        transitions.append(f"Start Lesson: Teach Section-{sec_num}.")
                except Exception:
                    pass

            if is_response_truncated(full_answer):
                print(
                    f"WARNING: talk_stream response appears truncated "
                    f"(last char: {full_answer[-5:]!r}, length: {len(full_answer)}). "
                    f"Consider raising TALK_MAX_TOKENS (currently {TALK_MAX_TOKENS}).",
                    flush=True,
                )

            with thread_lock:
                THREADS[thread_id].append(
                    {
                        "role": "user",
                        "content": transcript,
                    }
                )
                for t in transitions:
                    THREADS[thread_id].append({"role": "user", "content": t})
                THREADS[thread_id].append(
                    {
                        "role": "assistant",
                        "content": full_answer,
                    }
                )
                THREADS[thread_id] = THREADS[thread_id][-MAX_THREAD_MESSAGES:]
                save_threads()

            yield ndjson(
                {
                    "type": "done",
                    "thread_id": thread_id,
                    "answer": full_answer,
                    "messages": THREADS[thread_id],
                }
            )

    except subprocess.CalledProcessError as e:
        yield ndjson(
            {
                "type": "error",
                "error": "AUDIO_CONVERSION_FAILED",
                "details": e.stderr.decode("utf-8", errors="ignore")[-2000:],
            }
        )

    except Exception as e:
        yield ndjson(
            {
                "type": "error",
                "error": "MODEL_FAILED",
                "details": str(e),
            }
        )


async def websocket_send_json(websocket: WebSocket, data: dict):
    await websocket.send_text(json.dumps(data, ensure_ascii=False))


async def stream_sync_generator_to_websocket(
    websocket: WebSocket,
    generator_factory,
    stop_event: threading.Event,
):
    loop = asyncio.get_running_loop()
    output_queue: asyncio.Queue[str | None] = asyncio.Queue()

    def worker():
        try:
            for line in generator_factory():
                if stop_event.is_set():
                    break
                loop.call_soon_threadsafe(output_queue.put_nowait, line)
        except Exception as e:
            loop.call_soon_threadsafe(
                output_queue.put_nowait,
                ndjson({"type": "error", "error": "STREAM_FAILED", "details": str(e)}),
            )
        finally:
            loop.call_soon_threadsafe(output_queue.put_nowait, None)

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    while True:
        line = await output_queue.get()
        if line is None:
            break
        if stop_event.is_set():
            break
        await websocket.send_text(line)


async def process_ws_utterance(
    websocket: WebSocket,
    thread_id: str,
    wav_bytes: bytes,
    stop_event: threading.Event,
    viewed_slide: int | None = None,
    tts_provider: str = "kokoro",
    student_name: str | None = None,
):
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            wav_path = Path(tmpdir) / f"ws-{uuid.uuid4().hex}.wav"
            wav_path.write_bytes(wav_bytes)

            transcript = await asyncio.to_thread(transcribe_audio, wav_path)
            transcript = transcript.strip() or "[unclear audio]"

        if stop_event.is_set():
            return

        await stream_sync_generator_to_websocket(
            websocket=websocket,
            generator_factory=lambda: message_stream_generator(
                thread_id=thread_id,
                message=transcript,
                stop_event=stop_event,
                viewed_slide=viewed_slide,
                tts_provider=tts_provider,
                student_name=student_name,
            ),
            stop_event=stop_event,
        )
    except Exception as e:
        if not stop_event.is_set():
            await websocket_send_json(
                websocket,
                {"type": "error", "error": "WS_UTTERANCE_FAILED", "details": str(e)},
            )


async def process_ws_text_message(
    websocket: WebSocket,
    thread_id: str,
    text: str,
    stop_event: threading.Event,
    viewed_slide: int | None = None,
    tts_provider: str = "kokoro",
    student_name: str | None = None,
):
    try:
        await stream_sync_generator_to_websocket(
            websocket=websocket,
            generator_factory=lambda: message_stream_generator(
                thread_id=thread_id,
                message=text,
                stop_event=stop_event,
                viewed_slide=viewed_slide,
                tts_provider=tts_provider,
                student_name=student_name,
            ),
            stop_event=stop_event,
        )
    except Exception as e:
        if not stop_event.is_set():
            await websocket_send_json(
                websocket,
                {"type": "error", "error": "TEXT_MESSAGE_FAILED", "details": str(e)},
            )


@app.websocket("/ws/talk")
async def talk_websocket(websocket: WebSocket):
    await websocket.accept()

    thread_id = websocket.query_params.get("thread_id") or str(uuid.uuid4())
    tts_provider = websocket.query_params.get("tts_provider", "kokoro").lower()
    student_name = sanitize_student_name(websocket.query_params.get("student_name", ""))
    current_slide = None

    with thread_lock:
        THREADS.setdefault(thread_id, [])
        student_name = remember_student_name(thread_id, student_name)

    vad_session: StreamingVadSession | None = None
    response_stop_event = threading.Event()
    response_task: asyncio.Task | None = None

    await websocket_send_json(
        websocket,
        {
            "type": "ws_ready",
            "thread_id": thread_id,
            "sample_rate": PCM_SAMPLE_RATE,
            "channels": PCM_CHANNELS,
            "vad_silence_ms": VAD_END_SILENCE_MS,
        },
    )

    async def cancel_current_response():
        nonlocal response_stop_event, response_task
        response_stop_event.set()
        if response_task and not response_task.done():
            response_task.cancel()
            try:
                await response_task
            except asyncio.CancelledError:
                pass
            except Exception:
                pass
        response_stop_event = threading.Event()
        response_task = None

    async def finish_utterance(wav_bytes: bytes | None, reason: str):
        nonlocal vad_session, response_task, response_stop_event
        vad_session = None

        await websocket_send_json(websocket, {"type": "stop_mic", "reason": reason})

        if not wav_bytes:
            await websocket_send_json(
                websocket,
                {
                    "type": "done",
                    "thread_id": thread_id,
                    "answer": "",
                    "messages": THREADS.get(thread_id, []),
                    "reason": "no_speech_detected",
                },
            )
            return

        response_stop_event = threading.Event()
        response_task = asyncio.create_task(
            process_ws_utterance(
                websocket=websocket,
                thread_id=thread_id,
                wav_bytes=wav_bytes,
                stop_event=response_stop_event,
                viewed_slide=current_slide,
                tts_provider=tts_provider,
                student_name=student_name,
            )
        )

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            if message.get("text") is not None:
                try:
                    data = json.loads(message["text"])
                except Exception:
                    data = {}

                event_type = data.get("type")

                if event_type == "start_utterance":
                    await cancel_current_response()
                    current_slide = data.get("current_slide")
                    vad_session = StreamingVadSession()
                    await websocket_send_json(
                        websocket,
                        {"type": "mic_started", "thread_id": thread_id},
                    )

                elif event_type == "client_stop_utterance":
                    if vad_session is not None:
                        wav_bytes = vad_session.to_wav_bytes()
                        await finish_utterance(wav_bytes, "client_stop")

                elif event_type == "vad_audio":
                    await cancel_current_response()
                    current_slide = data.get("current_slide")
                    audio_b64 = data.get("audio_b64")

                    if not audio_b64:
                        await websocket_send_json(
                            websocket,
                            {
                                "type": "error",
                                "error": "MISSING_AUDIO",
                                "details": "vad_audio requires audio_b64",
                            },
                        )
                        continue

                    try:
                        wav_bytes = base64.b64decode(audio_b64)
                    except Exception as exc:
                        await websocket_send_json(
                            websocket,
                            {
                                "type": "error",
                                "error": "INVALID_AUDIO",
                                "details": str(exc),
                            },
                        )
                        continue

                    await websocket_send_json(
                        websocket,
                        {
                            "type": "transcribing",
                            "thread_id": thread_id,
                            "source": "browser_vad",
                        },
                    )

                    response_stop_event = threading.Event()
                    response_task = asyncio.create_task(
                        process_ws_utterance(
                            websocket=websocket,
                            thread_id=thread_id,
                            wav_bytes=wav_bytes,
                            stop_event=response_stop_event,
                            viewed_slide=current_slide,
                            tts_provider=tts_provider,
                            student_name=student_name,
                        )
                    )

                elif event_type == "text_message":
                    await cancel_current_response()
                    text = data.get("text")
                    current_slide = data.get("current_slide")
                    student_name = remember_student_name(thread_id, data.get("student_name") or student_name)
                    if text:
                        response_stop_event = threading.Event()
                        response_task = asyncio.create_task(
                            process_ws_text_message(
                                websocket=websocket,
                                thread_id=thread_id,
                                text=text,
                                stop_event=response_stop_event,
                                viewed_slide=current_slide,
                                tts_provider=tts_provider,
                                student_name=student_name,
                            )
                        )

                elif event_type == "cancel":
                    await cancel_current_response()
                    await websocket_send_json(websocket, {"type": "cancelled"})

                continue

            audio_bytes = message.get("bytes")
            if audio_bytes is not None and vad_session is not None:
                wav_bytes = vad_session.add_pcm16(audio_bytes)
                if wav_bytes is not None:
                    await finish_utterance(wav_bytes, "silence")

    except WebSocketDisconnect:
        pass
    finally:
        response_stop_event.set()
        if response_task and not response_task.done():
            response_task.cancel()


@app.get("/", response_class=HTMLResponse)
def index():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")


@app.post("/api/lesson/content")
async def update_lesson_content(payload: dict):
    try:
        student_name = sanitize_student_name(payload.get("studentName", ""))
        if student_name:
            payload["studentName"] = student_name
        else:
            payload.pop("studentName", None)
        CONTENT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/lesson/start/stream")
async def start_lesson_stream(
    thread_id: str = Form(default=""),
    tts_provider: str = Form(default="kokoro"),
    student_name: str = Form(default=""),
):
    return StreamingResponse(
        start_lesson_stream_generator(thread_id=thread_id, tts_provider=tts_provider, student_name=student_name),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/message/stream")
async def message_stream(
    message: str = Form(...),
    thread_id: str = Form(default=""),
    viewed_slide: int | None = Form(default=None),
    tts_provider: str = Form(default="kokoro"),
    student_name: str = Form(default=""),
):
    return StreamingResponse(
        message_stream_generator(thread_id=thread_id, message=message, viewed_slide=viewed_slide, tts_provider=tts_provider, student_name=student_name),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/talk/stream")
async def talk_stream(
    audio: UploadFile = File(...),
    thread_id: str = Form(default=""),
    tts_provider: str = Form(default="kokoro"),
    student_name: str = Form(default=""),
):
    audio_bytes = await audio.read()

    return StreamingResponse(
        talk_stream_generator(
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.webm",
            thread_id=thread_id,
            tts_provider=tts_provider,
            student_name=student_name,
        ),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/tts")
async def tts(payload: dict):
    try:
        text = payload.get("text", "")
        tts_provider = payload.get("tts_provider", "kokoro").lower()
        wav_bytes = text_to_tts_wav_bytes(text, tts_provider=tts_provider)

        return StreamingResponse(
            io.BytesIO(wav_bytes),
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-cache",
                "Content-Disposition": "inline; filename=tts.wav",
            },
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "error": "TTS_FAILED",
                "details": str(e),
            },
        )


@app.post("/api/thread/new")
def new_thread():
    thread_id = str(uuid.uuid4())

    with thread_lock:
        THREADS[thread_id] = []
        save_threads()

    return {"thread_id": thread_id, "messages": []}


@app.post("/api/thread/clear")
def clear_thread(thread_id: str = Form(...)):
    with thread_lock:
        THREADS[thread_id] = []
        save_threads()

    return {"thread_id": thread_id, "messages": []}


@app.get("/api/thread")
def get_thread(thread_id: str):
    return {
        "thread_id": thread_id,
        "messages": THREADS.get(thread_id, []),
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "transcription_model": "Whisper (faster-whisper)",
        "teaching_model": effective_openrouter_model_id(),
        "openrouter_nitro_enabled": effective_openrouter_model_id().endswith(":nitro"),
        "openrouter_provider_sort": OPENROUTER_PROVIDER_SORT or None,
        "teaching_provider": "openrouter",
        "threads": len(THREADS),
        "content_file_exists": CONTENT_FILE.exists(),
        "tts_provider": "kokoro",
        "kokoro_voice": KOKORO_VOICE,
        "kokoro_lang": KOKORO_LANG,
        "kokoro_speed": KOKORO_SPEED,
        "vad_enabled": VAD_ENABLED,
        "vad_loaded": vad_runtime.silero_vad_model is not None,
        "vad_threshold": VAD_THRESHOLD,
        "vad_upload_min_silence_ms": VAD_MIN_SILENCE_MS,
        "vad_stream_end_silence_ms": VAD_END_SILENCE_MS,
        "pcm_sample_rate": PCM_SAMPLE_RATE,
        "websocket_path": "/ws/talk",
    }
