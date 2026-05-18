export interface LessonPageProps {
  onBack: () => void;
}

export type HighlightState = {
  x: number;
  y: number;
  label: string;
  isDynamic?: boolean;
} | null;

export type IframeKeyHandlers = {
  down: (e: KeyboardEvent) => void;
  up: (e: KeyboardEvent) => void;
};

export type StreamTimingState = {
  id: number;
  label: string;
  startedAt: number;
  firstLineAt?: number;
  firstTranscriptAt?: number;
  firstTextAt?: number;
  firstAudioAt?: number;
  textChunks: number;
  audioChunks: number;
};

export type QueueEntry =
  | { kind: 'audio'; src: string }
  | { kind: 'tool'; data: unknown };
