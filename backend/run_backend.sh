#!/bin/bash

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -d venv ]; then
  source venv/bin/activate
fi

uvicorn app:app --host 0.0.0.0 --port 8000 --reload
