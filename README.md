# AstraCodex

AstraCodex is an interactive learning app where students learn with an AI Einstein mentor. The frontend presents playful course dashboards, rich lesson slides, image highlights, HTML interactives, webcam engagement insights, and live voice controls. The backend streams lesson-aware AI responses, turns text into speech, transcribes speech, and keeps local lesson thread history.

## What It Does

- Teaches lessons section by section with an AI tutor.
- Streams tutor responses as synchronized text, audio, and visual tool events.
- Supports speech input with browser VAD and backend transcription.
- Uses Kokoro or ElevenLabs for tutor voice output.
- Saves local lesson progress, thread history, quiz results, and parent-facing webcam insight summaries.
- Runs lesson content from JSON plus local HTML/image/3D assets.

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS, Framer Motion, WebVAD.
- **Backend**: FastAPI, OpenRouter, faster-whisper, Kokoro ONNX, ElevenLabs, Silero VAD.
- **Storage**: local JSON files in the backend and `localStorage` in the browser.
- **Local vision insights**: configurable Ollama-compatible vision endpoint.

## Project Structure

```text
astracodex/
  backend/
    app.py                 FastAPI routes, WebSocket entrypoint, stream orchestration
    config.py              backend/.env reader and runtime constants
    audio/                 transcription, TTS, and VAD helpers
    lesson/                lesson content, prompts, navigation, and message builders
    llm/                   OpenRouter client
    streaming/             NDJSON, tool-call, and audio-event stream helpers
    students/              learner-name helpers
    threads/               local thread storage
    tests/                 backend unit tests
  frontend/
    src/
      App.tsx              app routes and dashboard page
      config.ts            Vite env-backed frontend constants
      pages/
        LessonPage.tsx     live lesson orchestration
        AdminPage.tsx      content/admin editor
        dashboard/         dashboard types, themes, and report helpers
        lesson/            lesson UI, audio, VAD, asset, and iframe helpers
      data/content/        bundled lesson content and lesson assets
```

## Environment Files

Backend secrets and backend-only runtime constants belong in:

```bash
backend/.env
```

Frontend values must be client-safe `VITE_` keys and belong in:

```bash
frontend/.env
```

Start from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in keys such as `OPENROUTER_API_KEY` and `ELEVENLABS_API_KEY` in `backend/.env` only. Do not place backend secrets in `frontend/.env`.

## Local Setup

Install and run the backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./run_backend.sh
```

Install and run the frontend:

```bash
cd frontend
npm install
npm run dev
```

By default, the frontend reads `VITE_BACKEND_URL` from `frontend/.env`. Point it at your local backend if needed:

```env
VITE_BACKEND_URL=http://localhost:8000
```

## Local Model Files

Kokoro model files are intentionally not committed. Place them here when using local Kokoro TTS:

```text
backend/models/kokoro-v1.0.onnx
backend/models/voices-v1.0.bin
```

The backend also keeps local Hugging Face and Torch caches under paths configured in `backend/.env`.

## Useful Commands

Run backend tests:

```bash
backend/venv/bin/python -m unittest discover -s backend/tests
```

Build the frontend:

```bash
cd frontend
npm run build
```

Check backend health when the server is running:

```bash
curl http://localhost:8000/health
```

## Notes for Contributors

- Keep changes small and tested.
- Keep runtime config in `.env` files.
- Keep frontend env values public and prefixed with `VITE_`.
- Do not commit `.env`, local thread history, model binaries, virtualenvs, `node_modules`, or build output.
- When editing lesson content, keep backend prompt content and frontend lesson assets in sync.
