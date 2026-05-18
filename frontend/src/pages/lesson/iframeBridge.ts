type InteractiveBridgeMessage = {
  type?: string;
  id?: string;
  name?: string;
  value?: unknown;
};

type HighlightElement = HTMLElement & {
  __highlightTimeout?: number;
  __oldOutline?: string;
  __oldOutlineOffset?: string;
  __oldBoxShadow?: string;
};

const BRIDGE_MESSAGE_TYPES = new Set(["SHOW_COMPONENT", "CLICK_COMPONENT", "SET_SLIDER"]);
const FALLBACK_WORD_STOP_LIST = new Set(["the", "and", "for", "button", "bucket", "zone", "numbers"]);

function findInteractiveElement(iframeWin: Window, data: InteractiveBridgeMessage): HTMLElement | null {
  const doc = iframeWin.document;
  const name = data.name || "";
  let el: HTMLElement | null = data.id ? doc.getElementById(data.id) : null;

  if (!el && data.id) {
    el = doc.querySelector<HTMLElement>(`[data-id="${data.id}"]`);
  }

  if (!el && name) {
    const valMatch = name.match(/(-?\d+(\.\d+)?)/);
    const val = valMatch ? valMatch[0] : null;
    const lowerName = name.toLowerCase();

    if (lowerName.includes("drop point") && val) {
      el = doc.querySelector<HTMLElement>(`.drop-point[data-value="${val}"]`);
    } else if (lowerName.includes("number card") && val) {
      el = doc.querySelector<HTMLElement>(`.number-card[data-value="${val}"]`);
    } else if (lowerName.includes("reset")) {
      el = doc.getElementById("reset-button") || doc.querySelector<HTMLElement>(".reset-button");
    } else if (lowerName.includes("check")) {
      el = doc.getElementById("check-answer-button") || doc.querySelector<HTMLElement>(".check-answer-button");
    } else {
      const words = lowerName
        .split(/\s+/)
        .filter((word) => word.length > 2 && !FALLBACK_WORD_STOP_LIST.has(word));

      for (const word of words) {
        const singularWord = word.endsWith("s") ? word.slice(0, -1) : word;

        el =
          doc.querySelector<HTMLElement>(`[data-target*="${singularWord}"]`) ||
          doc.querySelector<HTMLElement>(`[data-type*="${singularWord}"]`) ||
          doc.querySelector<HTMLElement>(`[data-name*="${singularWord}"]`);

        if (el) break;
      }

      if (!el) {
        const buttons = Array.from(doc.querySelectorAll("button, [role=\"button\"]")) as HTMLElement[];
        el = buttons.find((button) => button.textContent?.toLowerCase().trim() === lowerName) || null;
      }
    }
  }

  if (!el && data.type === "SET_SLIDER") {
    const sliders = Array.from(doc.querySelectorAll('input[type="range"]')) as HTMLInputElement[];
    el = sliders.length === 1 ? sliders[0] : null;
  }

  return el;
}

function highlightElement(iframeWin: Window, el: HighlightElement) {
  if (!el.__highlightTimeout) {
    el.__oldOutline = el.style.outline;
    el.__oldOutlineOffset = el.style.outlineOffset;
    el.__oldBoxShadow = el.style.boxShadow;
  } else {
    iframeWin.clearTimeout(el.__highlightTimeout);
  }

  el.style.outline = "4px solid #3b82f6";
  el.style.outlineOffset = "4px";
  el.style.boxShadow = "0 0 15px rgba(59, 130, 246, 0.5)";

  el.__highlightTimeout = iframeWin.setTimeout(() => {
    el.style.outline = el.__oldOutline || "";
    el.style.outlineOffset = el.__oldOutlineOffset || "";
    el.style.boxShadow = el.__oldBoxShadow || "";
    delete el.__highlightTimeout;
  }, 2000);
}

function applySliderValue(iframeWin: Window, el: HTMLElement, value: unknown, id: string | undefined) {
  const slider = (
    el.matches('input[type="range"]')
      ? el
      : el.querySelector('input[type="range"]')
  ) as HTMLInputElement | null;

  if (!slider || value === undefined || value === null) {
    console.warn(`[AstraCodex] Could not set slider for id=${id}; no range input or value was found.`);
    return;
  }

  const numericValue = Number(value);
  let nextValue = String(value);

  if (Number.isFinite(numericValue)) {
    const min = slider.min === "" ? -Infinity : Number(slider.min);
    const max = slider.max === "" ? Infinity : Number(slider.max);
    nextValue = String(Math.min(max, Math.max(min, numericValue)));
  }

  slider.value = nextValue;
  const inputEvent = iframeWin.document.createEvent("Event");
  inputEvent.initEvent("input", true, false);
  const changeEvent = iframeWin.document.createEvent("Event");
  changeEvent.initEvent("change", true, false);
  slider.dispatchEvent(inputEvent);
  slider.dispatchEvent(changeEvent);
}

export function attachInteractiveBridge(iframeWin: Window & { __highlight_injected?: boolean }) {
  if (iframeWin.__highlight_injected) return;

  iframeWin.__highlight_injected = true;
  iframeWin.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as InteractiveBridgeMessage;
    if (!data || !data.type || !BRIDGE_MESSAGE_TYPES.has(data.type)) return;

    const el = findInteractiveElement(iframeWin, data);
    if (!el) {
      console.warn(
        `[AstraCodex] Could not find interactive element for highlight: id=${data.id}, name=${data.name || ""}. ` +
          `Please ensure your HTML has an element with id="${data.id}" or data-id="${data.id}".`,
      );
      return;
    }

    highlightElement(iframeWin, el as HighlightElement);

    if (data.type === "SET_SLIDER") {
      applySliderValue(iframeWin, el, data.value, data.id);
    }

    if (data.type === "CLICK_COMPONENT") {
      iframeWin.setTimeout(() => el.click(), 500);
    }
  });
}
