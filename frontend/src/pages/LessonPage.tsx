import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, Camera, Mic2 } from 'lucide-react';
import { MicVAD } from '@ricky0123/vad-web';
import { BACKEND_URL, VAD_BASE_ASSET_PATH, VAD_ONNX_WASM_BASE_PATH } from '../config';
import { getStoredLearnerName } from '../utils/learnerName';
import { float32ToWavBase64 } from './lesson/audio';
import { SlideContent } from './lesson/SlideContent';
import { captureAndAnalyzeWebcamSnapshot } from './lesson/webcamAnalysis';
import type { HighlightState, IframeKeyHandlers, LessonPageProps, QueueEntry, StreamTimingState } from './lesson/types';
import {
  BARGE_IN_GRACE_MS,
  BARGE_IN_START_DELAY_MS,
  PARLOR_LISTENING_POSITIVE_SPEECH_THRESHOLD,
  PARLOR_MIN_SPEECH_MS,
  PARLOR_NEGATIVE_SPEECH_THRESHOLD,
  PARLOR_PRE_SPEECH_PAD_MS,
  PARLOR_REDEMPTION_MS,
  PARLOR_SPEAKING_POSITIVE_SPEECH_THRESHOLD,
} from './lesson/vadConfig';

export default function LessonPage({ onBack }: LessonPageProps) {
  const { courseId, lessonId } = useParams();
  const lastSentContent = useRef<string | null>(null);

  const [slides, setSlides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<'up' | 'down'>('up');
  const [previousSlideIndex, setPreviousSlideIndex] = useState<number | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [threadId] = useState(() => {
    const key = `astracodex_thread_${courseId}_${lessonId}`;
    let savedId = localStorage.getItem(key);
    if (!savedId) {
      savedId = crypto.randomUUID();
      localStorage.setItem(key, savedId);
    }
    return savedId;
  });
  const lessonStartedRef = useRef(false);
  const [lessonHasStarted, setLessonHasStarted] = useState(false);
  const einsteinVideoRef = useRef<HTMLVideoElement | null>(null);

  const audioQueue = useRef<QueueEntry[]>([]);
  const isPlaying = useRef(false);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const isRecordingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [highlight, setHighlight] = useState<HighlightState>(null);
  const [imageSize, setImageSize] = useState<{ width: number, height: number } | null>(null);
  const [componentMap, setComponentMap] = useState<Record<string, any>>({});
  const [isEinsteinSpeaking, setIsEinsteinSpeaking] = useState(false);
  const [currentAudioSubtitle, setCurrentAudioSubtitle] = useState("");
  const [isWaitingForAudio, setIsWaitingForAudio] = useState(false);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const isWebcamActiveRef = useRef(false);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const [autoVoiceMode, setAutoVoiceMode] = useState(() => {
    const key = `astracodex_auto_voice_${courseId}_${lessonId}`;
    return localStorage.getItem(key) === '1';
  });
  const autoVoiceModeRef = useRef(autoVoiceMode);
  const assistantStreamingRef = useRef(false);
  const autoListenTimerRef = useRef<number | null>(null);
  const delayedBargeInTimerRef = useRef<number | null>(null);
  const browserVadRef = useRef<any>(null);
  const browserVadStartingRef = useRef(false);
  const browserVadSpeechActiveRef = useRef(false);
  const speakingStartedAtRef = useRef(0);
  const suppressCurrentVadUtteranceRef = useRef(false);

  // Sync Einstein video with speaking state
  useEffect(() => {
    if (einsteinVideoRef.current) {
      if (isEinsteinSpeaking) {
        einsteinVideoRef.current.play().catch(err => {
          console.warn("Einstein video play failed:", err);
        });
      } else {
        einsteinVideoRef.current.pause();
        einsteinVideoRef.current.currentTime = 0;
      }
    }
  }, [isEinsteinSpeaking]);

  // Sync webcam stream with video element
  useEffect(() => {
    if (webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream, isWebcamActive]);

  // Sync webcam state ref
  useEffect(() => {
    isWebcamActiveRef.current = isWebcamActive;
  }, [isWebcamActive]);

  // Cleanup webcam stream on unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  const toggleWebcam = async () => {
    if (isWebcamActive) {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        setWebcamStream(null);
      }
      setIsWebcamActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setWebcamStream(stream);
        setIsWebcamActive(true);
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    }
  };

  // Analyze webcam image after 5 seconds of activation
  useEffect(() => {
    let timeoutId: number | null = null;

    if (isWebcamActive) {
      timeoutId = window.setTimeout(async () => {
        await captureAndAnalyzeWebcam();
      }, 2000);
    }

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isWebcamActive]);

  const captureAndAnalyzeWebcam = async () => {
    if (!webcamVideoRef.current) return;

    let nextCaptureDelayMs = 500;

    try {
      const captured = await captureAndAnalyzeWebcamSnapshot({
        video: webcamVideoRef.current,
        lessonTitle,
        slideIndex: currentSlideIndexRef.current,
      });

      if (!captured) {
        nextCaptureDelayMs = 1000;
      }
    } catch (err) {
      console.error("Error analyzing webcam image:", err);
    } finally {
      if (isWebcamActiveRef.current) {
        window.setTimeout(() => captureAndAnalyzeWebcam(), nextCaptureDelayMs);
      }
    }
  };
  const voiceWsRef = useRef<WebSocket | null>(null);
  const wsOpeningRef = useRef<Promise<WebSocket> | null>(null);
  const micBargeInOnlyRef = useRef(false);
  const bargeInTriggeredRef = useRef(false);
  const streamTimingRef = useRef<StreamTimingState | null>(null);
  const streamTimingIdRef = useRef(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeKeyHandlersRef = useRef<IframeKeyHandlers | null>(null);

  const slidesRef = useRef<any[]>([]);
  const currentSlideIndexRef = useRef(0);
  const componentMapRef = useRef<Record<string, any>>({});
  const slideTransitionTimeoutRef = useRef<number | null>(null);

  const goToSlide = (target: number | ((currentIndex: number) => number)) => {
    setCurrentSlideIndex(prev => {
      const slideCount = slidesRef.current.length || slides.length;
      if (slideCount <= 0) return prev;

      const rawNextIndex = typeof target === 'function' ? target(prev) : target;
      const nextIndex = Math.max(0, Math.min(rawNextIndex, slideCount - 1));

      if (nextIndex !== prev) {
        setSlideDirection(nextIndex > prev ? 'up' : 'down');
        setPreviousSlideIndex(prev);
        setHighlight(null);

        if (slideTransitionTimeoutRef.current !== null) {
          window.clearTimeout(slideTransitionTimeoutRef.current);
        }

        slideTransitionTimeoutRef.current = window.setTimeout(() => {
          setPreviousSlideIndex(null);
          slideTransitionTimeoutRef.current = null;
        }, 560);
      }

      return nextIndex;
    });
  };

  // Browser VAD replaces the old RMS barge-in heuristic.
  // RMS treats any loud sound as speech; MicVAD checks for speech-like audio.

  useEffect(() => {
    const loadContent = async () => {
      try {
        setLoading(true);
        // Dynamically import the specific lesson content
        const module = await import(`../data/content/${courseId}/lesson-${lessonId}/lessonContent.json`);
        const lessonData = module.default || module;

        const parsedSlides = lessonData.sections.sort((a: any, b: any) => a.order - b.order);
        setLessonTitle(lessonData.lessonTitle || lessonData.title || `Lesson ${lessonId}`);
        setSlides(parsedSlides);

        const learnerName = getStoredLearnerName();
        const contentKey = `${courseId}-${lessonId}-${learnerName}`;
        if (lastSentContent.current === contentKey) return;
        lastSentContent.current = contentKey;

        try {
          const backendLessonData = learnerName ? { ...lessonData, studentName: learnerName } : lessonData;
          await fetch(`${BACKEND_URL}/api/lesson/content`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(backendLessonData)
          });
        } catch (e) {
          console.error("Failed to send lesson data to backend", e);
        }

      } catch (e) {
        console.error("Failed to load lesson content", e);
        setSlides([]);
      } finally {
        setLoading(false);
      }
    };

    if (courseId && lessonId) {
      loadContent();
    }
  }, [courseId, lessonId]);

  // Send quiz events WITHOUT interrupting Einstein's playback
  const sendQuizEvent = async (text: string) => {
    const ws = await connectVoiceWebSocket();
    if (ws.readyState !== WebSocket.OPEN) return;

    // Don't stop playback — let Einstein finish his current speech
    // The quiz event will be queued and Einstein will react after
    setIsWaitingForAudio(true);
    beginStreamTiming('quiz event -> model -> TTS');
    const viewedSlide = currentSlideIndexRef.current + 1;
    ws.send(JSON.stringify({
      type: 'text_message',
      text: text,
      thread_id: threadId,
      current_slide: viewedSlide,
      student_name: getStoredLearnerName()
    }));
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === 'COMPONENTS_MAPPED') {
        const mappedComponents = Array.isArray(data.components) ? data.components : [];
        const centersById = data.centersById || Object.fromEntries(
          mappedComponents.map((component: any) => [component.id, component])
        );
        console.log("🗺️ RECEIVED COMPONENT MAP:", centersById);
        setComponentMap(centersById);
      } else if (data.type === 'QUIZ_RESULT') {
        console.log("📝 QUIZ RESULT:", data);
        const resultText = data.isCorrect ? "CORRECT" : "INCORRECT";
        const message = `[SYSTEM_EVENT: QUIZ_RESULT] User answered ${resultText} for question about "${data.question}". Explanation: ${data.explanation}`;
        // Send quiz events WITHOUT interrupting Einstein's current speech
        sendQuizEvent(message);
      } else if (data.type === 'QUIZ_FINISHED') {
        console.log("✅ QUIZ FINISHED:", data);
        const message = `[SYSTEM_EVENT: QUIZ_FINISHED] User finished the quiz with score ${data.score}/${data.total} (${data.percent}%).`;
        sendQuizEvent(message);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  useEffect(() => {
    currentSlideIndexRef.current = currentSlideIndex;
    setImageSize(null);

    // Track progress and last used lesson
    if (courseId && lessonId && slides.length > 0) {
      const progress = Math.round(((currentSlideIndex + 1) / slides.length) * 100);
      localStorage.setItem(`astracodex_progress_${courseId}_${lessonId}`, progress.toString());
      localStorage.setItem(`astracodex_last_slide_${courseId}_${lessonId}`, currentSlideIndex.toString());
      localStorage.setItem('astracodex_last_lesson', JSON.stringify({ courseId, lessonId }));
    }
  }, [currentSlideIndex, courseId, lessonId, slides.length]);

  useEffect(() => {
    componentMapRef.current = componentMap;
  }, [componentMap]);

  useEffect(() => {
    autoVoiceModeRef.current = autoVoiceMode;
    const key = `astracodex_auto_voice_${courseId}_${lessonId}`;
    localStorage.setItem(key, autoVoiceMode ? '1' : '0');

    if (!autoVoiceMode) {
      clearDelayedBargeInTimer();

      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }

      if (isRecordingRef.current) {
        stopRecording(true);
      }
    } else {
      window.setTimeout(() => armAutoVoiceNow(), 0);
    }
  }, [autoVoiceMode, courseId, lessonId]);

  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
      }
    };
  }, []);

  const beginStreamTiming = (label: string) => {
    const timing: StreamTimingState = {
      id: streamTimingIdRef.current + 1,
      label,
      startedAt: performance.now(),
      textChunks: 0,
      audioChunks: 0,
    };

    streamTimingIdRef.current = timing.id;
    streamTimingRef.current = timing;

    console.groupCollapsed(`⏱️ Stream #${timing.id} started: ${label}`);
    console.log('Started at:', new Date().toLocaleTimeString());
    console.groupEnd();

    return timing;
  };

  const getOrCreateStreamTiming = (label = 'backend stream') => {
    if (!streamTimingRef.current) {
      return beginStreamTiming(label);
    }

    return streamTimingRef.current;
  };

  const streamElapsedMs = (timing = streamTimingRef.current) => {
    if (!timing) return 0;
    return Math.round(performance.now() - timing.startedAt);
  };

  const markFirstStreamLine = () => {
    const timing = getOrCreateStreamTiming();
    if (timing.firstLineAt === undefined) {
      timing.firstLineAt = performance.now();
      console.log(`📥 First backend event after ${streamElapsedMs(timing)}ms`);
    }
  };

  const finishStreamTiming = (reason: string) => {
    const timing = streamTimingRef.current;
    if (!timing) return;

    console.groupCollapsed(`✅ Stream #${timing.id} finished: ${reason}`);
    console.table({
      label: timing.label,
      total_ms: streamElapsedMs(timing),
      first_event_ms: timing.firstLineAt ? Math.round(timing.firstLineAt - timing.startedAt) : null,
      first_transcript_ms: timing.firstTranscriptAt ? Math.round(timing.firstTranscriptAt - timing.startedAt) : null,
      first_text_ms: timing.firstTextAt ? Math.round(timing.firstTextAt - timing.startedAt) : null,
      first_audio_ms: timing.firstAudioAt ? Math.round(timing.firstAudioAt - timing.startedAt) : null,
      text_chunks: timing.textChunks,
      audio_chunks: timing.audioChunks,
    });
    console.groupEnd();
  };

  const isTeacherOutputActive = () => (
    assistantStreamingRef.current ||
    isPlaying.current ||
    Boolean(activeAudioRef.current) ||
    audioQueue.current.length > 0
  );

  const scheduleAutoListening = () => {
    if (!autoVoiceModeRef.current) return;
    if (!lessonStartedRef.current) return;
    if (isRecordingRef.current) return;
    if (isTeacherOutputActive()) return;

    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
    }

    autoListenTimerRef.current = window.setTimeout(() => {
      autoListenTimerRef.current = null;

      if (!autoVoiceModeRef.current) return;
      if (!lessonStartedRef.current) return;
      if (isRecordingRef.current) return;
      if (isTeacherOutputActive()) return;

      startRecording({ interruptAi: false });
    }, 250);
  };

  const armAutoVoiceNow = () => {
    if (!autoVoiceModeRef.current) return;
    if (!lessonStartedRef.current) return;

    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }

    if (isRecordingRef.current || browserVadStartingRef.current) {
      if (!isTeacherOutputActive() && micBargeInOnlyRef.current) {
        promoteBargeInToBackendListening().catch(console.error);
      }
      return;
    }

    if (isTeacherOutputActive()) {
      clearDelayedBargeInTimer();
      startRecording({ interruptAi: false, bargeInOnly: true }).catch(console.error);
      return;
    }

    startRecording({ interruptAi: false }).catch(console.error);
  };

  // Incremented every time a tool fires a highlight. Each audio chunk captures
  // the token at the moment it starts; if the token is unchanged when the chunk
  // ends, no new highlight has fired and it is safe to clear the cursor.
  const highlightTokenRef = useRef(0);

  const fireToolEntry = (entry: { kind: 'tool'; data: any }) => {
    const data = entry.data;
    if (data.type === 'highlight') {
      const currentSlides = slidesRef.current;
      const slideIndex = currentSlideIndexRef.current;
      const currentSlide = currentSlides[slideIndex];

      if (currentSlide?.type === 'interactive') {
        const label = typeof data.label === 'string' ? data.label.trim() : '';
        const lowerLabel = label.toLowerCase();
        const components = Array.isArray(currentSlide.components) ? currentSlide.components : [];
        const comp = lowerLabel
          ? components.find((component: any) => {
              const componentId = String(component.id || '').toLowerCase();
              const componentName = String(component.name || '').toLowerCase();
              return componentId === lowerLabel || componentName === lowerLabel || componentName.includes(lowerLabel);
            })
          : undefined;
        const componentId = data.id || comp?.id || label;
        const iframe = iframeRef.current || document.querySelector('iframe');

        if (componentId && iframe?.contentWindow) {
          console.warn('🎯 Converted interactive highlight into SHOW_COMPONENT:', { ...data, id: componentId });
          iframe.contentWindow.postMessage({
            type: 'SHOW_COMPONENT',
            id: componentId,
            interactionType: comp?.interactionType || 'show',
            name: comp?.name || label,
          }, '*');
        } else {
          console.warn('🎯 Ignored image-style highlight on interactive slide:', data);
        }
        return;
      }

      console.log('🎯 HIGHLIGHT (synced):', data);
      setHighlight({ x: data.x, y: data.y, label: data.label });
      highlightTokenRef.current += 1;
    } else if (data.type === 'lesson_started') {
      console.log('📍 LESSON STARTED (synced):', data);
      const sectionStr = data.section || '';
      const sectionNum = parseInt(sectionStr.replace('Section-', ''));
      if (!isNaN(sectionNum)) {
        goToSlide(sectionNum - 1);
      }
    } else if (data.type === 'show_component' || data.type === 'click_component' || data.type === 'set_slider') {
      console.log(`🎮 INTERACTIVE TOOL (synced): ${data.type}`, data);

      const currentSlides = slidesRef.current;
      const slideIndex = currentSlideIndexRef.current;
      let interactionType = data.interactiontype || data.interactionType;
      let compName = data.name;
      let comp: any | undefined;

      // Fallback: if backend only sends id, look it up in components
      if (data.id && currentSlides[slideIndex]?.components) {
        comp = currentSlides[slideIndex].components.find((c: any) => c.id === data.id);
        if (comp) {
          interactionType = interactionType || comp.interactionType;
          compName = compName || comp.name;
        }
      }

      const iframe = iframeRef.current || document.querySelector('iframe');
      if (iframe && iframe.contentWindow) {
        const messageType =
          data.type === 'show_component'
            ? 'SHOW_COMPONENT'
            : data.type === 'click_component'
              ? 'CLICK_COMPONENT'
              : 'SET_SLIDER';

        let toolValue = data.value;
        if (data.type === 'set_slider' && toolValue !== undefined && toolValue !== null) {
          const numericValue = Number(toolValue);
          if (Number.isFinite(numericValue)) {
            const min = Number(data.min ?? comp?.min);
            const max = Number(data.max ?? comp?.max);
            const valueScale = Number(data.valueScale ?? comp?.valueScale ?? 1);
            const scaledMin = Number.isFinite(min) ? min : -Infinity;
            const scaledMax = Number.isFinite(max) ? max : Infinity;
            const clampedValue = Math.min(scaledMax, Math.max(scaledMin, numericValue));
            toolValue = Number.isFinite(valueScale) && valueScale > 1 ? clampedValue / valueScale : clampedValue;
          }
        }

        iframe.contentWindow.postMessage({
          type: messageType,
          id: data.id,
          value: toolValue,
          interactionType: interactionType,
          name: compName
        }, '*');
      }
    }
  };

  const clearDelayedBargeInTimer = () => {
    if (delayedBargeInTimerRef.current !== null) {
      window.clearTimeout(delayedBargeInTimerRef.current);
      delayedBargeInTimerRef.current = null;
    }
  };

  const playNextInQueue = () => {
    // If the user is actively answering, do not play teacher audio.
    // In Auto Voice barge-in mode the mic is only armed locally, so playback is allowed.
    if (isRecordingRef.current && !micBargeInOnlyRef.current) {
      isPlaying.current = false;
      speakingStartedAtRef.current = 0;
      clearDelayedBargeInTimer();
      setParlorVadSpeakingMode(false);
      setIsEinsteinSpeaking(false);
      setCurrentAudioSubtitle("");
      setIsWaitingForAudio(false);
      return;
    }

    // Drain all leading tool entries synchronously — they fire the moment
    // the audio chunk they precede is about to start.
    while (audioQueue.current.length > 0 && audioQueue.current[0].kind === 'tool') {
      fireToolEntry(audioQueue.current.shift() as { kind: 'tool'; data: any });
    }

    // If queue is empty (or only had tools), stop playback.
    if (audioQueue.current.length === 0) {
      isPlaying.current = false;
      speakingStartedAtRef.current = 0;
      clearDelayedBargeInTimer();
      setParlorVadSpeakingMode(false);
      setIsEinsteinSpeaking(false);
      setCurrentAudioSubtitle("");
      setIsWaitingForAudio(false);

      if (autoVoiceModeRef.current && micBargeInOnlyRef.current) {
        promoteBargeInToBackendListening();
      } else {
        scheduleAutoListening();
      }
      return;
    }

    // If we're already playing, don't start another loop
    if (isPlaying.current && activeAudioRef.current) {
      return;
    }

    const isFirstAudioChunkOfAnswer = speakingStartedAtRef.current === 0;

    isPlaying.current = true;
    if (isFirstAudioChunkOfAnswer) {
      speakingStartedAtRef.current = Date.now();
    }
    setParlorVadSpeakingMode(true);
    setIsEinsteinSpeaking(true);

    if (
      isFirstAudioChunkOfAnswer &&
      autoVoiceModeRef.current &&
      lessonStartedRef.current &&
      !isRecordingRef.current &&
      delayedBargeInTimerRef.current === null
    ) {
      delayedBargeInTimerRef.current = window.setTimeout(() => {
        delayedBargeInTimerRef.current = null;

        const teacherStillSpeaking =
          autoVoiceModeRef.current &&
          lessonStartedRef.current &&
          !isRecordingRef.current &&
          isTeacherOutputActive();

        if (!teacherStillSpeaking) return;

        startRecording({ interruptAi: false, bargeInOnly: true }).catch(console.error);
      }, BARGE_IN_START_DELAY_MS);
    }
    const entry = audioQueue.current.shift()! as { kind: 'audio'; src: string; text: string };
    const audio = new Audio(entry.src);
    activeAudioRef.current = audio;
    setCurrentAudioSubtitle(entry.text);

    // Snapshot the highlight token at the moment this chunk starts playing.
    // The tools for this chunk have already been fired (drained above), so the
    // token reflects exactly the highlight that belongs to this chunk.
    // If the token is still the same when the chunk ends, no new highlight has
    // fired and it is safe to clear the cursor.
    const chunkHighlightToken = highlightTokenRef.current;

    const onAudioFinished = () => {
      activeAudioRef.current = null;
      // Only clear the highlight if no new tool has fired a highlight since
      // this chunk began (i.e. the next chunk hasn't set a new cursor yet).
      if (highlightTokenRef.current === chunkHighlightToken && chunkHighlightToken > 0) {
        setHighlight(null);
      }
      if (isPlaying.current && (!isRecordingRef.current || micBargeInOnlyRef.current)) {
        playNextInQueue();
      } else {
        setCurrentAudioSubtitle("");
      }
    };

    audio.onended = onAudioFinished;

    audio.play().catch(err => {
      console.error("Audio playback failed", err);
      activeAudioRef.current = null;
      setCurrentAudioSubtitle("");
      if (highlightTokenRef.current === chunkHighlightToken && chunkHighlightToken > 0) {
        setHighlight(null);
      }
      if (isPlaying.current && (!isRecordingRef.current || micBargeInOnlyRef.current)) {
        playNextInQueue();
      }
    });
  };

  const handleBackendEvent = (data: any) => {
    if (data.type === 'ws_ready') {
      console.log('🔌 Voice WebSocket ready:', data);
      return;
    }

    if (data.type === 'mic_started') {
      console.log('🎤 Backend VAD is listening:', data);
      return;
    }

    if (data.type === 'stop_mic') {
      console.log('🛑 Backend asked to stop microphone:', data.reason);
      stopRecording(false);
      assistantStreamingRef.current = true;
      setIsWaitingForAudio(true);
      return;
    }

    if (data.type === 'cancelled') {
      console.log('⏹️ Backend stream cancelled');
      assistantStreamingRef.current = false;
      setIsWaitingForAudio(false);
      scheduleAutoListening();
      return;
    }

    if (data.type === 'error') {
      console.error('Backend error:', data);
      finishStreamTiming('error');
      assistantStreamingRef.current = false;
      setIsWaitingForAudio(false);
      scheduleAutoListening();
      return;
    }

    if (data.type === 'done') {
      finishStreamTiming('done');
      assistantStreamingRef.current = false;
      setIsWaitingForAudio(false);
      // Drain any tool entries left in the queue that have no audio following
      // (e.g. from a truncated stream). Fire them immediately.
      while (audioQueue.current.length > 0 && audioQueue.current[0].kind === 'tool') {
        fireToolEntry(audioQueue.current.shift() as { kind: 'tool'; data: any });
      }
      scheduleAutoListening();
      return;
    }

    if (data.type === 'transcribing') {
      const timing = getOrCreateStreamTiming('voice stream');
      console.log(`🎙️ Transcribing started +${streamElapsedMs(timing)}ms`, data);
      return;
    }

    if (data.type === 'transcribed') {
      const timing = getOrCreateStreamTiming('voice stream');
      console.log(`✅ Transcribed +${streamElapsedMs(timing)}ms`, data);
      return;
    }

    if (data.type === 'transcript') {
      const timing = getOrCreateStreamTiming('voice stream');
      if (timing.firstTranscriptAt === undefined) {
        timing.firstTranscriptAt = performance.now();
      }
      console.log(`📝 Transcript +${streamElapsedMs(timing)}ms:`, data.transcript);
      assistantStreamingRef.current = true;
      setIsWaitingForAudio(true);
      return;
    }

    if (data.type === 'delta') {
      const timing = getOrCreateStreamTiming('teacher text stream');
      timing.textChunks += 1;

      if (timing.firstTextAt === undefined) {
        timing.firstTextAt = performance.now();
        console.log(`🧠 First text delta after ${streamElapsedMs(timing)}ms`);
      }

      const backendElapsed = data.debug?.elapsed_ms;
      const chunkNumber = data.debug?.chunk ?? timing.textChunks;
      const backendLabel = backendElapsed !== undefined ? ` backend +${backendElapsed}ms` : '';

      console.log(
        `🧠 [Text Chunk #${chunkNumber} client +${streamElapsedMs(timing)}ms${backendLabel}]`,
        data.delta
      );
      return;
    }

    if (data.type === 'audio') {
      const timing = getOrCreateStreamTiming('teacher audio stream');
      timing.audioChunks += 1;
      setIsWaitingForAudio(false);

      if (timing.firstAudioAt === undefined) {
        timing.firstAudioAt = performance.now();
        console.log(`🔊 First audio chunk after ${streamElapsedMs(timing)}ms`);
      }

      const ttsMs = data.debug?.tts_ms;
      const ttsLabel = ttsMs !== undefined ? ` TTS ${ttsMs}ms` : '';
      console.log(`🔊 [Audio Chunk #${timing.audioChunks} client +${streamElapsedMs(timing)}ms${ttsLabel}]`, data.text);
      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }
      const mime = data.mime || 'audio/wav';
      const audioStr = `data:${mime};base64,${data.audio_b64}`;
      const audioText = typeof data.text === 'string' ? data.text : '';
      audioQueue.current.push({ kind: 'audio', src: audioStr, text: audioText });
      if (!isPlaying.current) {
        playNextInQueue();
      }
    }

    if (data.type === 'lesson_started') {
      console.log('📍 LESSON STARTED received → queued before next audio chunk');
      audioQueue.current.push({ kind: 'tool', data });
    }

    if (data.type === 'highlight') {
      console.log('🎯 HIGHLIGHT received → queued before next audio chunk');
      audioQueue.current.push({ kind: 'tool', data });
    }

    if (data.type === 'show_component' || data.type === 'click_component' || data.type === 'set_slider') {
      console.log(`🎮 INTERACTIVE TOOL received → queued before next audio chunk: ${data.type}`, data.id);
      audioQueue.current.push({ kind: 'tool', data });
    }
  };

  const getVoiceWsUrl = () => {
    const url = new URL(BACKEND_URL);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/talk';
    url.search = '';
    url.searchParams.set('thread_id', threadId);
    
    const ttsProvider = localStorage.getItem('tts_provider') || 'Kokoro';
    url.searchParams.set('tts_provider', ttsProvider.toLowerCase());

    const learnerName = getStoredLearnerName();
    if (learnerName) {
      url.searchParams.set('student_name', learnerName);
    }
    
    return url.toString();
  };

  const connectVoiceWebSocket = (): Promise<WebSocket> => {
    const existing = voiceWsRef.current;
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    if (wsOpeningRef.current) {
      return wsOpeningRef.current;
    }

    wsOpeningRef.current = new Promise((resolve, reject) => {
      const ws = new WebSocket(getVoiceWsUrl());
      ws.binaryType = 'arraybuffer';
      voiceWsRef.current = ws;

      ws.onopen = () => {
        console.log('🔌 Voice WebSocket connected');
        wsOpeningRef.current = null;
        resolve(ws);
      };

      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;

        const raw = event.data.trim();
        if (!raw) return;

        for (const line of raw.split('\n')) {
          if (!line.trim()) continue;
          markFirstStreamLine();
          try {
            const data = JSON.parse(line);
            if (data.type !== 'audio') {
              console.debug('📥 WebSocket event:', data);
            }
            handleBackendEvent(data);
          } catch (err) {
            console.error('Failed to parse WebSocket event', err, line);
          }
        }
      };

      ws.onerror = (event) => {
        console.error('Voice WebSocket error', event);
        wsOpeningRef.current = null;
        reject(event);
      };

      ws.onclose = () => {
        console.log('🔌 Voice WebSocket closed');
        voiceWsRef.current = null;
        wsOpeningRef.current = null;
        if (isRecordingRef.current) {
          stopRecording(false);
        }
      };
    });

    return wsOpeningRef.current;
  };

  const setParlorVadSpeakingMode = (speaking: boolean) => {
    const vad = browserVadRef.current;
    if (!vad || typeof vad.setOptions !== 'function') return;

    vad.setOptions({
      positiveSpeechThreshold: speaking
        ? PARLOR_SPEAKING_POSITIVE_SPEECH_THRESHOLD
        : PARLOR_LISTENING_POSITIVE_SPEECH_THRESHOLD,
    });
  };

  const stopTeacherPlaybackAndStreams = () => {
    clearDelayedBargeInTimer();

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (voiceWsRef.current?.readyState === WebSocket.OPEN) {
      voiceWsRef.current.send(JSON.stringify({ type: 'cancel' }));
    }

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = '';
      activeAudioRef.current = null;
    }

    audioQueue.current = [];
    isPlaying.current = false;
    speakingStartedAtRef.current = 0;
    suppressCurrentVadUtteranceRef.current = false;
    setParlorVadSpeakingMode(false);
    assistantStreamingRef.current = false;
    setIsEinsteinSpeaking(false);
    setCurrentAudioSubtitle("");
    setIsWaitingForAudio(false);
  };

  const forceStopLesson = () => {
    console.log('⏹️ Space pressed: Force stopping lesson...');

    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }

    lessonStartedRef.current = false;
    setLessonHasStarted(false);

    stopRecording(false);
    stopTeacherPlaybackAndStreams();
  };

  const promoteBargeInToBackendListening = async () => {
    if (!autoVoiceModeRef.current || !lessonStartedRef.current) return;

    if (!isRecordingRef.current) {
      await startRecording({ interruptAi: false, bargeInOnly: false });
      return;
    }

    if (!micBargeInOnlyRef.current) return;

    // With browser VAD there is no need to open a backend PCM utterance here.
    // The VAD is already running; after the teacher finishes, it simply becomes
    // normal listening and will send one complete audio segment on speech end.
    console.log('🎤 Teacher finished. Browser VAD is now listening for the student.');
    micBargeInOnlyRef.current = false;
    bargeInTriggeredRef.current = false;
  };

  const processResponseStream = async (res: Response, label = 'fetch stream') => {
    if (!res.body) {
      console.error("❌ Response body is null!");
      return;
    }

    if (!streamTimingRef.current) {
      beginStreamTiming(label);
    }

    console.log(`✅ ${label} connected! Processing...`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';

    while (true) {
      try {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          markFirstStreamLine();
          try {
            const data = JSON.parse(line);
            if (data.type !== 'audio') {
              console.debug('📥 Backend event:', data);
            }
            handleBackendEvent(data);
          } catch (err) {
            console.error("Error parsing stream chunk", err);
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.log("Stream aborted by user");
          finishStreamTiming('aborted');
          break;
        }
        throw err;
      }
    }
  };

  const startLessonStreaming = async () => {
    try {
      console.log("🚀 Space pressed: Starting lesson stream...");
      lessonStartedRef.current = true;
      setLessonHasStarted(true);
      assistantStreamingRef.current = true;
      setIsWaitingForAudio(true);
      if (autoVoiceModeRef.current) {
        window.setTimeout(() => armAutoVoiceNow(), 0);
      }
      connectVoiceWebSocket().catch(console.error);

      // Create new abort controller for this stream
      abortControllerRef.current = new AbortController();

      const formData = new FormData();
      formData.append('thread_id', threadId);
      const ttsProvider = localStorage.getItem('tts_provider') || 'Kokoro';
      formData.append('tts_provider', ttsProvider.toLowerCase());
      const learnerName = getStoredLearnerName();
      if (learnerName) {
        formData.append('student_name', learnerName);
      }

      // Create new abort controller for this stream
      abortControllerRef.current = new AbortController();

      beginStreamTiming('start lesson: fetch -> model -> TTS');
      const res = await fetch(`${BACKEND_URL}/api/lesson/start/stream`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal
      });

      console.log(`📡 Backend responded with status ${res.status} after ${streamElapsedMs()}ms`);
      await processResponseStream(res, 'start lesson: fetch -> model -> TTS');
    } catch (e) {
      console.error('❌ Lesson stream failed', e);
      setIsWaitingForAudio(false);
    } finally {
      assistantStreamingRef.current = false;
      abortControllerRef.current = null;
      setIsWaitingForAudio(false);
      scheduleAutoListening();
    }
  };

  const sendBrowserVadAudio = async (audio: Float32Array) => {
    if (!audio || audio.length === 0) return;

    const ws = await connectVoiceWebSocket();
    if (ws.readyState !== WebSocket.OPEN) return;

    const viewedSlide = currentSlideIndexRef.current + 1;
    const audioB64 = float32ToWavBase64(audio, 16000);

    assistantStreamingRef.current = true;
    setIsWaitingForAudio(true);
    beginStreamTiming('browser VAD: speech -> STT -> model -> TTS');

    ws.send(JSON.stringify({
      type: 'vad_audio',
      thread_id: threadId,
      current_slide: viewedSlide,
      sample_rate: 16000,
      audio_b64: audioB64,
    }));
  };

  const startRecording = async ({
    interruptAi = true,
    bargeInOnly = false,
  }: {
    interruptAi?: boolean;
    bargeInOnly?: boolean;
  } = {}) => {
    if (isRecordingRef.current || browserVadStartingRef.current) {
      if (!bargeInOnly && micBargeInOnlyRef.current) {
        await promoteBargeInToBackendListening();
      }
      return;
    }

    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }

    if (interruptAi) {
      console.log('🎤 Interrupting AI: clearing audio queue and stopping playback...');
      stopTeacherPlaybackAndStreams();
    } else if (!bargeInOnly && isTeacherOutputActive()) {
      scheduleAutoListening();
      return;
    }

    try {
      browserVadStartingRef.current = true;

      const ws = await connectVoiceWebSocket();
      if (ws.readyState !== WebSocket.OPEN) return;

      const vad = await MicVAD.new({
        getStream: async () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }),

        // Exact Parlor VAD values. While the teacher is speaking, we dynamically
        // raise positiveSpeechThreshold to 0.92, just like Parlor.
        positiveSpeechThreshold: PARLOR_LISTENING_POSITIVE_SPEECH_THRESHOLD,
        negativeSpeechThreshold: PARLOR_NEGATIVE_SPEECH_THRESHOLD,
        redemptionMs: PARLOR_REDEMPTION_MS,
        minSpeechMs: PARLOR_MIN_SPEECH_MS,
        preSpeechPadMs: PARLOR_PRE_SPEECH_PAD_MS,

        onSpeechStart: () => {
          browserVadSpeechActiveRef.current = true;
          suppressCurrentVadUtteranceRef.current = false;

          const teacherIsSpeaking =
            isPlaying.current ||
            activeAudioRef.current ||
            audioQueue.current.length > 0 ||
            assistantStreamingRef.current;

          if (teacherIsSpeaking) {
            // Ignore VAD triggers shortly after TTS starts because this is
            // usually speaker echo from the teacher, not the student.
            if (Date.now() - speakingStartedAtRef.current < BARGE_IN_GRACE_MS) {
              suppressCurrentVadUtteranceRef.current = true;
              console.log('Barge-in suppressed (teacher answer warm-up)');
              return;
            }

            if (!bargeInTriggeredRef.current) {
              bargeInTriggeredRef.current = true;
              micBargeInOnlyRef.current = false;
              console.log('🗣️ Browser VAD detected student speech. Interrupting teacher playback...');
              stopTeacherPlaybackAndStreams();
            }
          }

          console.log('🎤 Browser VAD: speech started');
        },

        onSpeechEnd: async (audio: Float32Array) => {
          browserVadSpeechActiveRef.current = false;

          if (suppressCurrentVadUtteranceRef.current) {
            suppressCurrentVadUtteranceRef.current = false;
            console.log('🎤 Browser VAD: ignored suppressed echo utterance');
            return;
          }

          micBargeInOnlyRef.current = false;

          console.log(`🎤 Browser VAD: speech ended (${Math.round(audio.length / 16)} ms), sending to backend`);
          await sendBrowserVadAudio(audio);

          // Stop local VAD while backend/teacher response is running.
          // Auto Voice will arm it again when the teacher starts/finishes speaking.
          stopRecording(false);
        },

        onVADMisfire: () => {
          browserVadSpeechActiveRef.current = false;
          suppressCurrentVadUtteranceRef.current = false;
          console.log('🎤 Browser VAD: ignored short/non-speech noise');
        },

        onnxWASMBasePath: VAD_ONNX_WASM_BASE_PATH,
        baseAssetPath: VAD_BASE_ASSET_PATH,
      });

      browserVadRef.current = vad;
      micBargeInOnlyRef.current = bargeInOnly;
      bargeInTriggeredRef.current = false;
      isRecordingRef.current = true;

      vad.start();
      setParlorVadSpeakingMode(bargeInOnly || isPlaying.current || Boolean(activeAudioRef.current));

      console.log(bargeInOnly ? '🎙️ Browser VAD armed for barge-in' : '🎙️ Browser VAD microphone started');
    } catch (err) {
      console.error('Failed to start browser VAD microphone', err);
      stopRecording(false);
    } finally {
      browserVadStartingRef.current = false;
    }
  };


  const stopRecording = (notifyBackend = true) => {
    if (!isRecordingRef.current && !browserVadRef.current) return;

    if (browserVadRef.current) {
      try {
        setParlorVadSpeakingMode(false);
        browserVadRef.current.pause();
        if (typeof browserVadRef.current.destroy === 'function') {
          browserVadRef.current.destroy();
        }
      } catch (err) {
        console.warn('Browser VAD cleanup failed', err);
      }
      browserVadRef.current = null;
    }

    browserVadSpeechActiveRef.current = false;
    browserVadStartingRef.current = false;
    suppressCurrentVadUtteranceRef.current = false;

    void notifyBackend;

    isRecordingRef.current = false;
    micBargeInOnlyRef.current = false;
    bargeInTriggeredRef.current = false;

    console.log('🛑 Browser VAD microphone stopped');
  };

  useEffect(() => {
    if (slides.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (e.repeat) return;
        e.preventDefault();
        if (!lessonStartedRef.current) {
          console.log("🚀 Space pressed: Starting lesson stream...");
          lessonStartedRef.current = true;
          startLessonStreaming();
        } else if (
          autoVoiceModeRef.current &&
          (isEinsteinSpeaking || isTeacherOutputActive())
        ) {
          forceStopLesson();
        } else if (isRecordingRef.current && micBargeInOnlyRef.current) {
          console.log("🎙️ Space pressed: forcing browser VAD into normal listening mode...");
          promoteBargeInToBackendListening().catch(console.error);
        } else if (!isRecordingRef.current) {
          console.log("🎙️ Space pressed: Starting PCM voice stream...");
          startRecording({ interruptAi: true });
        } else {
          console.log("🛑 Space pressed again: Manually stopping microphone...");
          stopRecording(true);
        }
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight') {
        e.preventDefault();
        goToSlide(prev => prev + 1);
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(prev => prev - 1);
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(console.error);
        } else {
          document.exitFullscreen().catch(console.error);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        // Microphone is stopped by backend VAD after silence, or by pressing Space again.
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Store handlers so we can attach them to iframe contentWindow on load
    iframeKeyHandlersRef.current = { down: handleKeyDown, up: handleKeyUp };

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      iframeKeyHandlersRef.current = null;
    };
  }, [slides.length, threadId]);

  useEffect(() => {
    return () => {
      if (autoListenTimerRef.current !== null) {
        window.clearTimeout(autoListenTimerRef.current);
        autoListenTimerRef.current = null;
      }

      if (slideTransitionTimeoutRef.current !== null) {
        window.clearTimeout(slideTransitionTimeoutRef.current);
        slideTransitionTimeoutRef.current = null;
      }

      stopTeacherPlaybackAndStreams();
      stopRecording(false);

      if (voiceWsRef.current) {
        voiceWsRef.current.close();
        voiceWsRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-full bg-[#FFE1C4] flex items-center justify-center">
        <div className="text-white text-xl animate-pulse font-medium tracking-wider">Loading Lesson Content...</div>
      </div>
    );
  }

  if (slides.length === 0) {
    return (
      <div className="h-screen w-full bg-[#FFE1C4] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Content Not Found</h2>
          <p className="text-slate-600 mb-8">We couldn't load the requested lesson.</p>
          <button
            onClick={onBack}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium w-full border-2 border-black/70 shadow-md shadow-black/60"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentSlide = currentSlideIndex >= 0 ? slides[currentSlideIndex] : null;
  const avatarSubtitleText = currentAudioSubtitle || (isWaitingForAudio ? "Thinking..." : "");

  const renderLessonSlide = (slide: any, isActive = true) => (
    <SlideContent
      slide={slide}
      isActive={isActive}
      highlight={highlight}
      imageSize={imageSize}
      onImageSizeChange={setImageSize}
      courseId={courseId}
      lessonId={lessonId}
      iframeRef={iframeRef}
      iframeKeyHandlersRef={iframeKeyHandlersRef}
    />
  );

  return (
    <div className="h-screen w-full bg-[#FFE1C4] p-3 sm:p-3 font-sans overflow-hidden">
      <div className="w-full h-full bg-[#FFE1C4] rounded-[2rem] sm:rounded-[1rem] flex flex-col relative overflow-hidden ">

        <style>{`
          @keyframes lessonScreenSlideInUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }

          @keyframes lessonScreenSlideOutUp {
            from { transform: translateY(0); }
            to { transform: translateY(-100%); }
          }

          @keyframes lessonScreenSlideInDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
          }

          @keyframes lessonScreenSlideOutDown {
            from { transform: translateY(0); }
            to { transform: translateY(100%); }
          }

          .lesson-screen-slide-in-up {
            animation: lessonScreenSlideInUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .lesson-screen-slide-out-up {
            animation: lessonScreenSlideOutUp 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .lesson-screen-slide-in-down {
            animation: lessonScreenSlideInDown 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .lesson-screen-slide-out-down {
            animation: lessonScreenSlideOutDown 520ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          @media (prefers-reduced-motion: reduce) {
            .lesson-screen-slide-in-up,
            .lesson-screen-slide-out-up,
            .lesson-screen-slide-in-down,
            .lesson-screen-slide-out-down {
              animation-duration: 1ms;
            }
          }
        `}</style>

        {/* Top Bar */}
        <div className="w-full bg-[#FFE1C4] px-4 py-1 sm:px-4 sm:py-1 flex items-center justify-between z-20 ">
          {/* Back Button */}
          <button
            onClick={onBack}
            className="flex bg-white/50 items-center cursor-pointer rounded-full p-2 text-slate-700 hover:text-slate-900 transition-colors border-2 border-black/70 shadow-md shadow-black/60"
          >
            <ArrowLeft size={20} />
          </button>


          {/* Action Icons */}
          <div className="flex items-center gap-3 text-slate-600">
            {/* Webcam Toggle */}
            <button
              type="button"
              onClick={toggleWebcam}
              aria-label="Toggle Vision Report"
              title="Vision Report"
              className={`group flex items-center rounded-full p-2 transition-all duration-300 backdrop-blur-md overflow-hidden border-2 border-black/70 shadow-md shadow-black/60 ${isWebcamActive
                ? 'bg-emerald-50/80 text-emerald-700'
                : 'bg-white/50 text-slate-500 hover:bg-white/80'
                }`}
            >
              <Camera size={18} className="shrink-0" />

              <div className={`relative ml-0 h-4 w-0 shrink-0 overflow-hidden rounded-full opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:w-7 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:w-7 group-focus-visible:opacity-100 ${isWebcamActive ? 'bg-emerald-500' : 'bg-slate-300'
                }`}>
                <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-300 ease-spring ${isWebcamActive ? 'left-3.5' : 'left-0.5'
                  }`} />
              </div>
            </button>

            {/* Auto Voice AI Chip */}
            <button
              type="button"
              onClick={() => setAutoVoiceMode(prev => !prev)}
              aria-label="Toggle Live voice mode"
              title="Live"
              className={`group flex items-center rounded-full p-2 transition-all duration-300 backdrop-blur-md overflow-hidden border-2 border-black/70 shadow-md shadow-black/60 ${autoVoiceMode
                ? 'bg-indigo-50/80 text-indigo-700'
                : 'bg-white/50 text-slate-500 hover:bg-white/80'
                }`}
            >
              <Mic2 size={18} className="shrink-0" />

              <div className={`relative ml-0 h-4 w-0 shrink-0 overflow-hidden rounded-full opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:w-7 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:w-7 group-focus-visible:opacity-100 ${autoVoiceMode ? 'bg-indigo-500' : 'bg-slate-300'
                }`}>
                <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-300 ease-spring ${autoVoiceMode ? 'left-3.5' : 'left-0.5'
                  }`} />
              </div>
            </button>



          </div>
        </div>

        {/* Main Lesson Content */}
        <div className="flex-1 w-full flex items-center justify-center z-10 px-2 sm:px-2 pb-2 relative min-h-0">

          {/* Slide Content */}
          <div className="relative w-full h-full rounded-[2rem] p-1 overflow-hidden ">
            {previousSlideIndex !== null && slides[previousSlideIndex] && (
              <div
                key={`old-${previousSlideIndex}-${currentSlideIndex}`}
                className={`absolute inset-0 p-1 will-change-transform bg-white/30 backdrop-blur-[1px] ${
                  slideDirection === 'up' ? 'lesson-screen-slide-out-up' : 'lesson-screen-slide-out-down'
                }`}
              >
                {renderLessonSlide(slides[previousSlideIndex], false)}
              </div>
            )}

            <div
              key={`active-${currentSlideIndex}`}
              className={`${previousSlideIndex !== null ? 'absolute inset-0 p-1 will-change-transform ' : 'relative w-full h-full '} ${
                previousSlideIndex !== null
                  ? slideDirection === 'up'
                    ? 'lesson-screen-slide-in-up'
                    : 'lesson-screen-slide-in-down'
                  : ''
              }`}
            >
              {renderLessonSlide(currentSlide, true)}
            </div>
          </div>

        </div>

        {/* Slide Navigation on bottom-left side */}
        <div className="absolute bottom-4 sm:bottom-4 left-4 sm:left-4 text-slate-400 font-regular text-lg tracking-wide z-10 text-center">
          <div className="flex items-center gap-0">
            <button
              onClick={() => goToSlide(prev => prev - 1)}
              aria-label="Previous section"
              title="Previous section (Arrow Up)"
              className="flex items-center cursor-pointer rounded-full p-2 text-slate-500 hover:text-slate-600 transition-colors"
            >
              <ArrowUp size={20} />
            </button>
            <button
              onClick={() => goToSlide(prev => prev + 1)}
              aria-label="Next section"
              title="Next section (Arrow Down)"
              className="flex items-center cursor-pointer rounded-full p-2 text-slate-500 hover:text-slate-600 transition-colors"
            >
              <ArrowDown size={20} />
            </button>
          </div>
        </div>

        {/* Space Prompt */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 max-w-[58vw] -translate-x-1/2 text-center sm:max-w-[420px]">
          <div className="rounded-full border-2 border-black/60 bg-white/65 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-slate-600 shadow-md shadow-black/30 backdrop-blur-md sm:px-4 sm:text-sm">
            {lessonHasStarted ? 'Press Space to ask/answer the question' : 'Press Space to start the lesson'}
          </div>
        </div>

        {/* Webcam Video */}
        {isWebcamActive && (
          <div className="absolute bottom-16 left-4 z-20 overflow-hidden rounded-2xl border-2 border-white shadow-xl bg-black w-[160px] sm:w-[240px] aspect-video">
            <video
              ref={webcamVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          </div>
        )}

        {/* Avatar Video */}
        <div
          style={{ bottom: '0px', right: '0px' }}
          className="absolute z-20 flex w-[180px] flex-col items-center pointer-events-none sm:w-[280px]"
        >
          {avatarSubtitleText && (
            <div className="mb-1 max-w-full rounded-lg border-2 border-black/65 bg-white/80 px-2.5 py-1.5 text-center text-[11px] font-semibold leading-snug text-slate-700 shadow-md shadow-black/30 backdrop-blur-md sm:text-sm">
              {avatarSubtitleText}
            </div>
          )}
          <video
            ref={einsteinVideoRef}
            src="/assets/einstein_avatar1.webm"
            loop
            muted
            playsInline
            className="w-full"
          />
        </div>

      </div>
    </div>
  );
}
