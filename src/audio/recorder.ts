/**
 * Microphone capture for one attempt.
 *
 * The recorded audio never leaves the browser. It is not uploaded, not
 * persisted, and not sent to the grading endpoint — only the transcript is.
 * The blob exists so a future version can offer playback, and so that a failed
 * transcription is recoverable within the same session.
 */

export interface Recorder {
  /** Stop capture and return what was recorded, or null if nothing usable. */
  stop(): Promise<Blob | null>;
  /** Abandon: stop the hardware and keep nothing. */
  discard(): void;
  readonly mimeType: string;
}

export class MicrophoneUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The microphone is not available");
    this.name = "MicrophoneUnavailableError";
    this.cause = cause;
  }
}

/** First supported type wins; Safari does not do webm. */
function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startRecording(): Promise<Recorder> {
  if (!isRecordingSupported()) {
    throw new MicrophoneUnavailableError("MediaRecorder is not supported in this browser");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    // Permission denied, no device, or the OS grabbed it. The caller lets the
    // timer run anyway so a silent attempt is still possible.
    throw new MicrophoneUnavailableError(error);
  }

  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.start();

  const releaseHardware = () => {
    stream.getTracks().forEach((track) => track.stop());
  };

  let settled = false;

  return {
    mimeType: recorder.mimeType || mimeType,

    stop() {
      return new Promise<Blob | null>((resolve) => {
        if (settled || recorder.state === "inactive") {
          releaseHardware();
          resolve(null);
          return;
        }
        settled = true;
        recorder.addEventListener(
          "stop",
          () => {
            releaseHardware();
            resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
          },
          { once: true },
        );
        recorder.stop();
      });
    },

    discard() {
      settled = true;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Already stopping; the tracks still need releasing.
        }
      }
      chunks.length = 0;
      releaseHardware();
    },
  };
}
