/**
 * Speech to text during the timed minute, via the browser's Web Speech API.
 *
 * PRIVACY, STATED ACCURATELY: in Chrome and Edge this API streams audio to the
 * browser vendor's speech service. It is NOT on-device. Anywhere the product
 * describes where data goes, it has to say so — claiming local transcription
 * while Google does the work would be false.
 *
 * This is also why the transcript review screen exists. The API is unsupported
 * in Firefox, partial in Safari, and unreliable across a continuous minute, so
 * the user always gets to read and correct the text before it is graded.
 */

// The Web Speech API is not in TypeScript's DOM lib. Minimal shapes only.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FATAL_ERRORS = new Set(["network", "not-allowed", "service-not-allowed", "audio-capture"]);

export function isTranscriptionSupported(): boolean {
  return getConstructor() !== null;
}

export interface LiveTranscript {
  /** Stop listening and return the final text. */
  stop(): string;
  /** Abandon without returning anything. */
  discard(): void;
  /** Best text so far, including the in-progress phrase. */
  current(): string;
}

export interface LiveTranscriptOptions {
  lang?: string;
  /** Called as text arrives, so the UI can show it building. */
  onUpdate?: (text: string) => void;
  /** Called when recognition stops on its own, e.g. a network drop. */
  onError?: (error: string) => void;
}

export function startLiveTranscript(options: LiveTranscriptOptions = {}): LiveTranscript | null {
  const Ctor = getConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.lang ?? "en-US";

  let settled = "";
  let interim = "";
  let stopped = false;

  const combined = () => `${settled} ${interim}`.replace(/\s+/g, " ").trim();

  recognition.onresult = (event) => {
    interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result) continue;
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) settled += ` ${text}`;
      else interim += ` ${text}`;
    }
    options.onUpdate?.(combined());
  };

  recognition.onerror = (event) => {
    // 'no-speech' and 'aborted' are normal and not worth surfacing.
    const error = event.error ?? "unknown";
    if (error === "no-speech" || error === "aborted") return;
    // These do not recover by restarting; retrying only loops on the same error.
    if (FATAL_ERRORS.has(error)) stopped = true;
    options.onError?.(error);
  };

  recognition.onend = () => {
    // Chrome ends the session on its own after a pause. Restart while the
    // attempt is still running, or long answers get truncated mid-sentence.
    if (!stopped) {
      try {
        recognition.start();
      } catch {
        // Already restarting, or the engine is gone. Whatever is settled stands.
      }
    }
  };

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    current: combined,
    stop() {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        // Nothing to stop.
      }
      return combined();
    },
    discard() {
      stopped = true;
      try {
        recognition.abort();
      } catch {
        // Nothing to abort.
      }
      settled = "";
      interim = "";
    },
  };
}
