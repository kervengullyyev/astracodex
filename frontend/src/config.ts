const readViteEnv = (key: string, fallback: string): string => {
  const value = import.meta.env[key];
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim() || fallback;
};

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const BACKEND_URL = stripTrailingSlash(
  readViteEnv("VITE_BACKEND_URL", window.location.origin),
);

export const VISION_ENDPOINT = readViteEnv(
  "VITE_VISION_ENDPOINT",
  "https://www.derkarhanak.space/v1/generate",
);

export const VISION_MODEL = readViteEnv("VITE_VISION_MODEL", "gemma4:e2b");

export const VAD_ONNX_WASM_BASE_PATH = readViteEnv(
  "VITE_VAD_ONNX_WASM_BASE_PATH",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
);

export const VAD_BASE_ASSET_PATH = readViteEnv(
  "VITE_VAD_BASE_ASSET_PATH",
  "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.29/dist/",
);
