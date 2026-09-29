/**
 * The handoff between Explain and Debrief.
 *
 * A module-level slot, deliberately not sessionStorage and not the progress
 * store. Two reasons:
 *
 *  - The audio blob has no business being serialised anywhere. It exists for
 *    the length of one attempt and is dropped.
 *  - Abandoning an attempt must leave no trace. Clearing a variable is
 *    complete in a way that clearing storage keys is not.
 *
 * Surviving a page reload is explicitly not wanted here: if you reload
 * mid-attempt, the attempt is gone, which matches what Esc does.
 */

export interface PendingAttempt {
  topicId: string;
  spokenSeconds: number;
  transcript: string;
  /** Present only when the microphone was available. Never uploaded. */
  audio: Blob | null;
  /** True when speech recognition never produced anything usable. */
  transcriptUnavailable: boolean;
}

let slot: PendingAttempt | null = null;

export function setPendingAttempt(attempt: PendingAttempt): void {
  releaseAudio(slot);
  slot = attempt;
}

export function peekPendingAttempt(): PendingAttempt | null {
  return slot;
}

/** Read once and clear, so a Debrief refresh cannot re-grade the same audio. */
export function takePendingAttempt(): PendingAttempt | null {
  const current = slot;
  slot = null;
  return current;
}

export function clearPendingAttempt(): void {
  releaseAudio(slot);
  slot = null;
}

/** Update the transcript in place after the user edits it on the review screen. */
export function updatePendingTranscript(transcript: string): void {
  if (slot) slot = { ...slot, transcript };
}

function releaseAudio(attempt: PendingAttempt | null): void {
  if (attempt?.audio && typeof URL !== "undefined") {
    // Nothing holds an object URL today, but revoking here keeps that true if
    // a playback control is ever added.
    try {
      URL.revokeObjectURL(URL.createObjectURL(attempt.audio));
    } catch {
      // Not fatal; the blob is dropped either way.
    }
  }
}
