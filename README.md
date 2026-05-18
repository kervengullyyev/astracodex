# AstraCodex

AstraCodex is an interactive learning platform with a whimsical React lesson UI and a FastAPI backend for AI tutoring, speech, TTS, and lesson-aware interactions.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS, WebVAD
- Backend: FastAPI, OpenRouter, faster-whisper, Kokoro ONNX, ElevenLabs
- Storage: local JSON and browser `localStorage`

## Local Setup

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Backend:

```bash
cd backend
cp .env.example .env
# Fill in the API keys you need.
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
./run_backend.sh
```

Kokoro model files are intentionally not committed. Place local model artifacts under `backend/models/` when needed.
